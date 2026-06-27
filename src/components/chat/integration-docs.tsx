"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Copy, CheckCheck, Terminal, Code2, RefreshCw, KeyRound, LogIn } from "lucide-react";
import { toast } from "sonner";
import { copyToClipboard } from "@/lib/utils";
import { toClaudeCodeApiKey } from "@/lib/api-keys";
import { trpc } from "@/lib/trpc/client";

const tools: {
  name: string;
  icon: string;
  command: (base: string, key: string) => string;
  description: string;
}[] = [
  {
    name: "Claude Code",
    icon: "🤖",
    command: (base, key) => {
      const claudeKey = key.startsWith("YOUR_") ? key : toClaudeCodeApiKey(key);
      return `ANTHROPIC_BASE_URL=${base} ANTHROPIC_API_KEY=${claudeKey} claude`;
    },
    description:
      "Use ANTHROPIC_BASE_URL (not API_BASE_URL). Keys are per-space — regenerate in this space's API docs. The command prefixes your key with sk-ant-api03- for Claude Code.",
  },
  {
    name: "Codex App",
    icon: "🔵",
    command: (base, key) => `OPENAI_API_BASE=${base} OPENAI_API_KEY=${key} codex`,
    description: "Override OPENAI_API_BASE to redirect all completions to your space.",
  },
  {
    name: "OpenClaw",
    icon: "🦀",
    command: (base, key) => `OPENAI_BASE_URL=${base} OPENAI_API_KEY=${key} openclaw`,
    description: "Use OPENAI_BASE_URL to point OpenClaw at your space.",
  },
  {
    name: "Hermes Agent",
    icon: "🎭",
    command: (base, key) => `OPENAI_API_BASE_URL=${base} OPENAI_API_KEY=${key} hermes`,
    description: "Set OPENAI_API_BASE_URL and run Hermes Agent normally.",
  },
  {
    name: "Codex CLI",
    icon: "⚡",
    command: (base, key) => `OPENAI_API_BASE=${base} OPENAI_API_KEY=${key} codex`,
    description: "Same as Codex App — override OPENAI_API_BASE.",
  },
  {
    name: "OpenCode",
    icon: "🟩",
    command: (base, key) => `opencode configure --api-base ${base} --api-key ${key}`,
    description: "Use the configure subcommand to store the base URL persistently.",
  },
];

const sdkExample = (base: string, key: string) => `import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "${base}",
  apiKey: "${key}",
});

const stream = await client.chat.completions.create({
  model: "qwen",
  messages: [{ role: "user", content: "Hello!" }],
  stream: true,
});

for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content ?? "");
}`;

const curlExample = (base: string, key: string) => `curl ${base}/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${key}" \\
  -d '{
    "model": "qwen",
    "messages": [{"role": "user", "content": "Hello!"}],
    "stream": true
  }'`;

export function IntegrationDocs({
  slug,
  spaceId,
  hasComputeAccess = true,
  apiKey,
  onKeyRegenerated,
  onSignInClick,
}: {
  slug: string;
  spaceId: string;
  hasComputeAccess?: boolean;
  /** Raw API key — present only when user is logged in */
  apiKey: string | null;
  onKeyRegenerated: (newKey: string) => void;
  onSignInClick: () => void;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const regenerate = trpc.keys.regenerate.useMutation();

  const base =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/v1/${slug}`
      : `/api/v1/${slug}`;

  const displayKey = apiKey ?? "YOUR_API_KEY";

  const handleCopy = (text: string, id: string) => {
    if (!apiKey) {
      toast.error("Sign in to get your API key first.");
      return;
    }
    if (copyToClipboard(text)) {
      setCopied(id);
      toast.success("Copied!");
      setTimeout(() => setCopied(null), 2000);
    } else {
      toast.error("Could not copy to clipboard");
    }
  };

  const handleRegenerate = () => {
    if (!hasComputeAccess) {
      toast.error("Choose a package to enable API keys.");
      return;
    }
    regenerate.mutate(
      { spaceId },
      {
        onSuccess: (data) => {
          onKeyRegenerated(data.rawKey);
          toast.success("New API key generated. Copy it now — it won't be shown again.");
        },
        onError: (err) => {
          toast.error(err.message || "Failed to regenerate key.");
        },
      }
    );
  };

  const CopyBtn = ({ text, id }: { text: string; id: string }) => (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="relative z-10"
      onMouseDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        handleCopy(text, id);
      }}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      {copied === id ? (
        <CheckCheck className="size-3.5 text-green-500" />
      ) : (
        <Copy className="size-3.5" />
      )}
    </Button>
  );

  return (
    <div className="space-y-6 pb-6">
      <div>
        <h2 className="text-lg font-bold">API Documentation</h2>
      </div>

      {/* Login prompt if not authenticated */}
      {!apiKey && (
        <Card className="border-dashed">
          <CardContent className="py-4 flex items-center gap-3">
            <KeyRound className="size-4 text-muted-foreground shrink-0" />
            <p className="text-sm text-muted-foreground flex-1">
              Sign in to get your personal API key.
            </p>
            <Button size="sm" variant="outline" onClick={onSignInClick} className="gap-1.5 shrink-0">
              <LogIn className="size-3.5" />
              Sign in
            </Button>
          </CardContent>
        </Card>
      )}

      {/* API base URL */}
      <Card className="bg-muted/40 border-dashed">
        <CardContent className="py-3 px-4 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-muted-foreground mb-0.5">API base URL</p>
            <code className="text-sm font-mono text-primary break-all">{base}</code>
          </div>
          <CopyBtn text={base} id="base" />
        </CardContent>
      </Card>

      {/* Personal API key */}
      <Card>
        <CardContent className="py-3 px-4">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <KeyRound className="size-3" />
              Your API key
            </p>
            {apiKey && hasComputeAccess && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 text-xs gap-1 text-muted-foreground"
                disabled={regenerate.isPending}
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleRegenerate();
                }}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
              >
                <RefreshCw className={`size-3 ${regenerate.isPending ? "animate-spin" : ""}`} />
                Regenerate
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <code className={`text-sm font-mono break-all flex-1 ${apiKey ? "text-primary" : "text-muted-foreground"}`}>
              {apiKey ?? "Sign in to reveal your key"}
            </code>
            {apiKey && <CopyBtn text={apiKey} id="apikey" />}
          </div>
          {apiKey && hasComputeAccess && (
            <p className="text-xs text-muted-foreground mt-1.5">
              Keep this secret. Regenerate if you suspect it was compromised.
            </p>
          )}
          {apiKey && !hasComputeAccess && (
            <p className="text-xs text-muted-foreground mt-1.5">
              API keys require an active package or free trial compute. Choose a package to continue.
            </p>
          )}
        </CardContent>
      </Card>

      {/* OpenAI SDK */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Code2 className="size-4" /> OpenAI SDK
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="relative">
            <pre className="bg-muted rounded-lg p-3 text-xs font-mono overflow-x-auto whitespace-pre">
              {sdkExample(base, displayKey)}
            </pre>
            <div className="absolute top-2 right-2 z-10">
              <CopyBtn text={sdkExample(base, displayKey)} id="sdk" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Use your personal API key above — each user has a unique key tied to their account.
          </p>
        </CardContent>
      </Card>

      {/* cURL */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Terminal className="size-4" /> cURL
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="relative">
            <pre className="bg-muted rounded-lg p-3 text-xs font-mono overflow-x-auto whitespace-pre">
              {curlExample(base, displayKey)}
            </pre>
            <div className="absolute top-2 right-2 z-10">
              <CopyBtn text={curlExample(base, displayKey)} id="curl" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick setup by tool */}
      <div>
        <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
          <Terminal className="size-4" /> Quick setup by tool
        </h3>
        <div className="space-y-3">
          {tools.map((tool) => {
            const cmd = tool.command(base, displayKey);
            return (
              <Card key={tool.name}>
                <CardContent className="pt-3 pb-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span>{tool.icon}</span>
                      <p className="font-medium text-sm">{tool.name}</p>
                    </div>
                    <CopyBtn text={cmd} id={tool.name} />
                  </div>
                  <pre className="bg-muted rounded-md p-2.5 text-xs font-mono overflow-x-auto whitespace-pre text-muted-foreground">
                    {cmd}
                  </pre>
                  <p className="text-xs text-muted-foreground">{tool.description}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
