"""
AICAF – Qwen3-1.7B Q4_K_M GGUF inference on Modal (NVIDIA T4)
==============================================================

Uses llama-cpp-python (GGUF) on a T4, with **GPU memory snapshots** so cold
starts stay fast even with `min_containers=0` (no idle GPU cost).

How the fast cold start works
-----------------------------
The expensive parts of a cold boot are: CUDA init, loading the GGUF onto the
GPU, allocating the KV cache, and compiling the first CUDA kernels. We do all
of that once inside `@modal.enter(snap=True)` and let Modal snapshot the
resulting CPU + GPU memory. Subsequent cold starts *restore* that snapshot
instead of redoing the work, turning a ~60s cold boot into a few seconds.

Deploy (snapshots only work for deployed apps):
    modal deploy modal/serve.py

After deploy, copy the printed web endpoint URL into .env. Note the URL now
includes the class name:
    MODAL_API_URL=https://your-workspace--aicaf-qwen3-model-serve.modal.run

The endpoint is fully OpenAI-compatible:
    POST /v1/chat/completions
    GET  /v1/models
"""

import modal

# ─── Model config ─────────────────────────────────────────────────────────────

MODEL_REPO = "bartowski/Qwen_Qwen3-1.7B-GGUF"
MODEL_FILE = "Qwen_Qwen3-1.7B-Q4_K_M.gguf"
MODEL_DIR  = "/model"
MODEL_PATH = f"{MODEL_DIR}/{MODEL_FILE}"

MODEL_NAME = "qwen3-1.7b-q4_k_m"
N_CTX      = 32768   # full 32 K context window
N_PARALLEL = 4       # concurrent request slots (matches @modal.concurrent)

# ─── Image ────────────────────────────────────────────────────────────────────

def _download():
    import os
    from huggingface_hub import hf_hub_download
    hf_hub_download(
        repo_id=MODEL_REPO,
        filename=MODEL_FILE,
        local_dir=MODEL_DIR,
        token=os.environ.get("HF_TOKEN"),
    )

model_image = (
    # CUDA devel image so llama-cpp-python can compile with GPU support
    modal.Image.from_registry(
        "nvidia/cuda:12.1.1-devel-ubuntu22.04",
        add_python="3.11",
    )
    .apt_install("git", "cmake", "build-essential", "libcurl4-openssl-dev")
    .pip_install(
        "huggingface_hub[hf_transfer]>=0.30.0",
        "fastapi>=0.115",
        "uvicorn[standard]",
    )
    .env({
        "HF_HUB_ENABLE_HF_TRANSFER": "1",
        # Build llama-cpp-python with CUDA backend.
        # Override CC/CXX because the CUDA devel image sets CC="clang -pthread"
        # (a value with embedded flags) which CMake rejects as an invalid compiler path.
        "CC": "gcc",
        "CXX": "g++",
        "CMAKE_ARGS": "-DGGML_CUDA=on",
        "FORCE_CMAKE": "1",
    })
    # Build from source with CUDA — cached in the image layer after first build
    .pip_install("llama-cpp-python>=0.3.0")
    # Download model weights into the image so containers start without fetching
    .run_function(
        _download,
        timeout=60 * 15,
        secrets=[modal.Secret.from_name("huggingface-secret")],
    )
)

# Import inside the container only; keeps the snapshot/import path clean.
with model_image.imports():
    from llama_cpp import Llama

# ─── App ──────────────────────────────────────────────────────────────────────

app = modal.App("aicaf-qwen3")

# ─── Model class (GPU-snapshotted) + ASGI server ──────────────────────────────

@app.cls(
    image=model_image,
    gpu="T4",
    # ── Serverless GPU cost / cold-start tuning ──────────────────────────────
    min_containers=0,          # no idle GPU cost
    scaledown_window=3 * 60,
    buffer_containers=1,
    timeout=10 * 60,
    # ── Fast cold starts without keeping a GPU warm ──────────────────────────
    # Snapshot CPU *and* GPU memory after warm-up so restores skip CUDA init,
    # model load, KV-cache alloc, and first-kernel compilation.
    enable_memory_snapshot=True,
    experimental_options={"enable_gpu_snapshot": True},
)
# 4 concurrent slots — matches N_PARALLEL; llama-cpp batches internally
@modal.concurrent(max_inputs=N_PARALLEL)
class Model:
    @modal.enter(snap=True)
    def load(self):
        # GPU is available here because enable_gpu_snapshot=True, so the model
        # is loaded straight onto the T4 and captured in the snapshot.
        self.llm = Llama(
            model_path=MODEL_PATH,
            n_ctx=N_CTX,
            n_gpu_layers=-1,    # offload every layer to T4
            n_parallel=N_PARALLEL,
            n_threads=4,
            verbose=False,
        )
        # Warm up: force CUDA kernels + KV cache to be allocated/compiled now so
        # they live inside the snapshot and restored containers are already hot.
        self.llm.create_chat_completion(
            messages=[{"role": "user", "content": "hi"}],
            max_tokens=1,
        )

    @modal.asgi_app(requires_proxy_auth=True)
    def serve(self):
        import json
        import time
        import uuid
        from typing import Iterator

        import fastapi
        from fastapi import Request
        from fastapi.middleware.cors import CORSMiddleware
        from fastapi.responses import JSONResponse, StreamingResponse

        llm = self.llm

        web_app = fastapi.FastAPI(title="AICAF Qwen3-1.7B", version="1.0")

        web_app.add_middleware(
            CORSMiddleware,
            allow_origins=["*"],
            allow_methods=["*"],
            allow_headers=["*"],
        )

        # ── /v1/models ───────────────────────────────────────────────────────

        @web_app.get("/v1/models")
        async def list_models():
            return {
                "object": "list",
                "data": [
                    {
                        "id": MODEL_NAME,
                        "object": "model",
                        "created": 1700000000,
                        "owned_by": "aicafe",
                    }
                ],
            }

        # ── /v1/chat/completions ─────────────────────────────────────────────

        @web_app.post("/v1/chat/completions")
        async def chat_completions(request: Request):
            body = await request.json()

            messages: list       = body.get("messages", [])
            stream: bool         = body.get("stream", False)
            temperature: float   = float(body.get("temperature", 0.7))
            # -1 = fill remaining context (no artificial cap)
            max_tokens: int      = int(body.get("max_tokens", -1))
            top_p: float         = float(body.get("top_p", 1.0))
            presence_penalty: float = float(body.get("presence_penalty", 0.0))
            repeat_penalty: float   = 1.0 + presence_penalty  # llama-cpp equivalent

            if not messages:
                return JSONResponse(
                    {"error": {"message": "messages is required", "type": "invalid_request_error"}},
                    status_code=400,
                )

            req_id  = str(uuid.uuid4())
            created = int(time.time())

            # ── Streaming ─────────────────────────────────────────────────────

            if stream:
                def token_stream() -> Iterator[str]:
                    for chunk in llm.create_chat_completion(
                        messages=messages,
                        temperature=temperature,
                        max_tokens=max_tokens,
                        top_p=top_p,
                        repeat_penalty=repeat_penalty,
                        stream=True,
                    ):
                        delta   = chunk["choices"][0].get("delta", {})
                        content = delta.get("content")
                        if content:
                            payload = {
                                "id": f"chatcmpl-{req_id}",
                                "object": "chat.completion.chunk",
                                "created": created,
                                "model": MODEL_NAME,
                                "choices": [
                                    {
                                        "index": 0,
                                        "delta": {"role": "assistant", "content": content},
                                        "finish_reason": None,
                                    }
                                ],
                            }
                            yield f"data: {json.dumps(payload)}\n\n"

                    final = {
                        "id": f"chatcmpl-{req_id}",
                        "object": "chat.completion.chunk",
                        "created": created,
                        "model": MODEL_NAME,
                        "choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}],
                    }
                    yield f"data: {json.dumps(final)}\n\n"
                    yield "data: [DONE]\n\n"

                return StreamingResponse(
                    token_stream(),
                    media_type="text/event-stream",
                    headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
                )

            # ── Non-streaming ──────────────────────────────────────────────────

            response = llm.create_chat_completion(
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
                top_p=top_p,
                repeat_penalty=repeat_penalty,
                stream=False,
            )

            return {
                "id": f"chatcmpl-{req_id}",
                "object": "chat.completion",
                "created": created,
                "model": MODEL_NAME,
                "choices": [
                    {
                        "index": 0,
                        "message": {
                            "role": "assistant",
                            "content": response["choices"][0]["message"]["content"],
                        },
                        "finish_reason": "stop",
                    }
                ],
                "usage": response.get("usage", {}),
            }

        # ── Health check ───────────────────────────────────────────────────────

        @web_app.get("/health")
        async def health():
            return {"status": "ok", "model": MODEL_NAME, "gpu": "T4"}

        return web_app
