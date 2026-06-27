"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc/client";
import { authClient } from "@/lib/auth-client";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { IntegrationDocs } from "@/components/chat/integration-docs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Plus, ArrowUp, Paperclip, LogIn, LogOut, MessageSquare,
  Trash2, Bot, User, Loader2, X, ChevronLeft, ChevronRight,
  Moon, Sun, BookOpen, CalendarX, MessageCircle,
} from "lucide-react";
import { getWhatsAppUrl } from "@/lib/contact";
import { useDropzone } from "react-dropzone";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Space = {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
  model: { model: { modelId: string; displayName: string } } | null;
  subscription?: { tier: string; schedule: string } | null;
  hasComputeAccess: boolean;
};

function isScheduleBlocked(schedule: string | undefined | null): boolean {
  if (!schedule || schedule === "every day") return false;
  const dayOfWeek = new Date().getDay(); // 0 = Sunday, 6 = Saturday
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  if (schedule === "weekends") return !isWeekend;
  if (schedule === "weekdays") return isWeekend;
  return false;
}

function scheduleLabel(schedule: string): string {
  if (schedule === "weekends") return "weekends (Saturday & Sunday)";
  if (schedule === "weekdays") return "weekdays (Monday – Friday)";
  return "every day";
}

type Message = {
  id: string;
  role: "USER" | "ASSISTANT" | "SYSTEM";
  content: string;
  createdAt: Date;
};

type ChatSession = {
  id: string;
  title: string;
  updatedAt: Date;
};

export function ChatInterface({ space }: { space: Space }) {
  const { data: session } = authClient.useSession();
  const user = session?.user;
  const { theme, setTheme } = useTheme();
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState<boolean | null>(null);
  const sidebarExpanded = sidebarOpen ?? !isMobile;
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingSessionId, setStreamingSessionId] = useState<string | null>(null);
  const [streamingContent, setStreamingContent] = useState("");
  const [docsOpen, setDocsOpen] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<
    { name: string; content: string; type: string }[]
  >([]);

  // Raw API key — held in a ref so it never triggers re-renders and is not
  // serialized to storage. Populated once after login.
  const apiKeyRef = useRef<string | null>(null);
  const [keyReady, setKeyReady] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const activeSessionIdRef = useRef<string | null>(null);
  /** When set, the next dbMessages load should hydrate local state (sidebar pick / new chat). */
  const hydratingSessionRef = useRef<string | null>(null);
  const visitIdRef = useRef<string | null>(null);
  const visitStartRef = useRef<number>(Date.now());
  const messageCountRef = useRef<number>(0);
  const fairShareWarnedRef = useRef(false);

  const utils = trpc.useUtils();

  const scheduleBlocked = isScheduleBlocked(space.subscription?.schedule);
  const hasComputeAccess = space.hasComputeAccess;

  const recordVisit = trpc.analytics.recordVisit.useMutation();
  const endVisit = trpc.analytics.endVisit.useMutation();
  const getOrCreateKey = trpc.keys.getOrCreate.useMutation();
  const regenerateKey = trpc.keys.regenerate.useMutation();

  // Once the user logs in, provision their personal API key for this space
  useEffect(() => {
    if (!user) {
      apiKeyRef.current = null;
      setKeyReady(false);
      return;
    }
    if (!hasComputeAccess) {
      apiKeyRef.current = null;
      setKeyReady(false);
      return;
    }
    if (apiKeyRef.current) return; // already provisioned this session

    getOrCreateKey.mutate(
      { spaceId: space.id },
      {
        onSuccess: (data) => {
          if (data.rawKey) {
            apiKeyRef.current = data.rawKey;
            setKeyReady(true);
          } else {
            // Key already exists but the raw key is never returned after initial
            // creation. Regenerate to get a fresh raw key for this session.
            regenerateKey.mutate(
              { spaceId: space.id },
              {
                onSuccess: (regen) => {
                  apiKeyRef.current = regen.rawKey;
                  setKeyReady(true);
                },
                onError: () => {
                  toast.error("Could not provision your API key. Please refresh.");
                },
              }
            );
          }
        },
        onError: () => {
          toast.error("Could not provision your API key. Please refresh.");
        },
      }
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, hasComputeAccess]);

  // Track visit lifecycle (only when space has an active plan)
  useEffect(() => {
    if (!hasComputeAccess) return;

    const now = new Date();
    visitStartRef.current = Date.now();
    messageCountRef.current = 0;
    recordVisit.mutate(
      {
        spaceId: space.id,
        visitorIp: "client",
        hourOfDay: now.getHours(),
        dayOfWeek: now.getDay(),
      },
      {
        onSuccess: (v) => { if (v) visitIdRef.current = v.id; },
      }
    );

    const handleEnd = () => {
      if (!visitIdRef.current) return;
      const durationSecs = Math.round((Date.now() - visitStartRef.current) / 1000);
      // Use sendBeacon so it fires even on tab close
      navigator.sendBeacon(
        "/api/analytics/end-visit",
        JSON.stringify({ id: visitIdRef.current, durationSecs, messageCount: messageCountRef.current })
      );
    };

    window.addEventListener("beforeunload", handleEnd);
    return () => {
      window.removeEventListener("beforeunload", handleEnd);
      handleEnd();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [space.id, hasComputeAccess]);

  const { data: chatSessions, refetch: refetchSessions } =
    trpc.chat.getSessions.useQuery(
      { spaceId: space.id, userId: user?.id },
      { enabled: !!space.id }
    );

  const { data: dbMessages, refetch: refetchMessages } =
    trpc.chat.getMessages.useQuery(
      { sessionId: activeSessionId! },
      { enabled: !!activeSessionId && !activeSessionId.startsWith("local-") }
    );

  useEffect(() => {
    activeSessionIdRef.current = activeSessionId;
  }, [activeSessionId]);

  useEffect(() => {
    if (!dbMessages || !activeSessionId || activeSessionId.startsWith("local-")) return;
    if (hydratingSessionRef.current !== activeSessionId) return;
    if (isStreaming) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mapped: Message[] = (dbMessages as any[]).map((m) => ({
      id: m.id as string,
      role: m.role as Message["role"],
      content: m.content as string,
      createdAt: new Date(m.createdAt),
    }));
    setMessages(mapped);
    hydratingSessionRef.current = null;
  }, [dbMessages, activeSessionId, isStreaming]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

  const createSession = trpc.chat.createSession.useMutation();

  const saveMessage = trpc.chat.saveMessage.useMutation();
  const updateTitle = trpc.chat.updateSessionTitle.useMutation();
  const deleteSession = trpc.chat.deleteSession.useMutation({
    onSuccess: () => {
      if (activeSessionId) setActiveSessionId(null);
      setMessages([]);
      refetchSessions();
    },
  });

  const handleNewChat = () => {
    if (!hasComputeAccess) {
      setActiveSessionId(null);
      setMessages([]);
      return;
    }
    createSession.mutate({
      spaceId: space.id,
      userId: user?.id,
      title: "New Chat",
    }, {
      onSuccess: (s) => {
        activeSessionIdRef.current = s.id;
        hydratingSessionRef.current = s.id;
        setActiveSessionId(s.id);
        setMessages([]);
        refetchSessions();
      },
    });
  };

  const selectSession = (sessionId: string) => {
    activeSessionIdRef.current = sessionId;
    hydratingSessionRef.current = sessionId;
    setActiveSessionId(sessionId);
    setDocsOpen(false);
  };

  const isCurrentSessionStreaming =
    isStreaming &&
    streamingSessionId !== null &&
    streamingSessionId === (activeSessionId ?? activeSessionIdRef.current);

  const onDrop = useCallback(async (files: File[]) => {
    for (const file of files) {
      if (file.type === "application/pdf") {
        const toastId = toast.loading(`Parsing ${file.name}…`);
        try {
          const fd = new FormData();
          fd.append("file", file);
          const res = await fetch("/api/parse-pdf", { method: "POST", body: fd });
          const data = await res.json();
          if (data.text) {
            setAttachedFiles((prev) => [
              ...prev,
              { name: file.name, content: data.text, type: file.type },
            ]);
            toast.success(`${file.name} parsed (${data.pages} pages)`, { id: toastId });
          } else {
            toast.error("Failed to parse PDF", { id: toastId });
          }
        } catch {
          toast.error("Failed to parse PDF", { id: toastId });
        }
      } else if (file.type.startsWith("text/") || file.type === "application/json") {
        const text = await file.text();
        setAttachedFiles((prev) => [
          ...prev,
          { name: file.name, content: text.slice(0, 8000), type: file.type },
        ]);
      } else {
        toast.error(`Unsupported file type: ${file.type}`);
      }
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    noClick: true,
    accept: {
      "text/*": [],
      "application/pdf": [],
      "application/json": [],
    },
  });

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isCurrentSessionStreaming) return;

    if (!user) {
      toast.error("Sign in to start chatting.");
      return;
    }

    if (!apiKeyRef.current) {
      toast.error("Your API key is not ready yet. Please wait a moment.");
      return;
    }

    let sessionId = activeSessionId;

    if (!sessionId) {
      if (hasComputeAccess) {
        const s = await new Promise<{ id: string }>((resolve) => {
          createSession.mutate(
            { spaceId: space.id, userId: user?.id, title: text.slice(0, 40) },
            {
              onSuccess: (created) => {
                activeSessionIdRef.current = created.id;
                setActiveSessionId(created.id);
                refetchSessions();
                resolve(created);
              },
            }
          );
        });
        sessionId = s.id;
      } else {
        sessionId = `local-${Date.now()}`;
        activeSessionIdRef.current = sessionId;
        setActiveSessionId(sessionId);
      }
    }

    setInput("");

    const userMsg: Message = {
      id: `tmp-${Date.now()}`,
      role: "USER",
      content: text,
      createdAt: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setStreamingSessionId(sessionId);
    setIsStreaming(true);
    setStreamingContent("");

    // Auto-detect URLs and fetch their content as context
    let contextContent = text;
    const urlRegex = /https?:\/\/[^\s<>"{}|\\^[\]`]+/g;
    const detectedUrls = [...new Set(text.match(urlRegex) ?? [])].slice(0, 3);
    if (detectedUrls.length > 0) {
      const fetchedContents: string[] = [];
      await Promise.all(
        detectedUrls.map(async (url) => {
          try {
            const res = await fetch(`/api/fetch-url?url=${encodeURIComponent(url)}`);
            const data = await res.json();
            if (data.text) fetchedContents.push(`Content from ${url}:\n${data.text}`);
          } catch {}
        })
      );
      if (fetchedContents.length > 0) {
        contextContent = `${text}\n\n${fetchedContents.join("\n\n")}`;
      }
    }

    // Attach file context
    if (attachedFiles.length > 0) {
      const fileContext = attachedFiles
        .map((f) => `File: ${f.name}\n\`\`\`\n${f.content}\n\`\`\``)
        .join("\n\n");
      contextContent = `${contextContent}\n\nAttached files:\n${fileContext}`;
    }

    messageCountRef.current += 1;

    // Save user message
    if (hasComputeAccess) {
      await saveMessage.mutateAsync({
        sessionId,
        role: "USER",
        content: text,
      });
    }

    try {
      const history = [
        ...messages.map((m) => ({ role: m.role.toLowerCase(), content: m.content })),
        { role: "user", content: contextContent },
      ];

      const res = await fetch(`/api/v1/${space.slug}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKeyRef.current}`,
        },
        body: JSON.stringify({
          model: "qwen",
          messages: history,
          stream: true,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        if (res.status === 429) {
          try {
            const errJson = JSON.parse(errText);
            toast.error(
              errJson.error?.message ??
                "This space is at capacity. Please try again shortly."
            );
          } catch {
            toast.error("This space is at capacity. Please try again shortly.");
          }
          return;
        }
        if (res.status === 402) {
          try {
            const errJson = JSON.parse(errText);
            toast.error(errJson.error?.message ?? "Compute quota exceeded.");
          } catch {
            toast.error("Compute quota exceeded.");
          }
          return;
        }
        throw new Error(errText);
      }

      if (res.headers.get("X-Fair-Share-Exceeded") === "true" && !fairShareWarnedRef.current) {
        fairShareWarnedRef.current = true;
        const overflowRemaining = res.headers.get("X-Overflow-Remaining");
        toast.warning(
          overflowRemaining
            ? `You've passed your fair share. You can use up to ${overflowRemaining}s more this period from the shared pool.`
            : "You've passed your fair share and are now using surplus compute from the shared pool."
        );
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let rawContent = "";

      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6).trim();
            if (data === "[DONE]") break;
            try {
              const json = JSON.parse(data);
              const delta = json.choices?.[0]?.delta?.content;
              if (delta) {
                rawContent += delta;
                setStreamingContent(stripThinking(rawContent));
              }
            } catch {}
          }
        }
      }

      const fullContent = stripThinking(rawContent);

      // Finalize
      const assistantMsg: Message = {
        id: `tmp-${Date.now() + 1}`,
        role: "ASSISTANT",
        content: fullContent,
        createdAt: new Date(),
      };
      if (activeSessionIdRef.current === sessionId) {
        setMessages((prev) => [...prev, assistantMsg]);
      }
      setStreamingContent("");

      if (hasComputeAccess) {
        await saveMessage.mutateAsync({
          sessionId,
          role: "ASSISTANT",
          content: fullContent,
        });
      }

      // Update session title after first exchange
      if (hasComputeAccess && messages.length === 0) {
        const title = text.slice(0, 60);
        updateTitle.mutate({ sessionId, title });
        refetchSessions();
      }
    } catch (err) {
      toast.error("Failed to get response. Please try again.");
      setStreamingContent("");
    } finally {
      setIsStreaming(false);
      setStreamingSessionId(null);
      setStreamingContent("");
      setAttachedFiles([]);
    }
  };

  const initials = user?.name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div
      {...getRootProps()}
      className={cn(
        "flex h-screen bg-background",
        isDragActive && "ring-2 ring-primary ring-inset"
      )}
    >
      <input {...getInputProps()} />

      {/* Sidebar */}
      <aside
        className={cn(
          "border-r flex flex-col shrink-0 transition-all duration-200",
          sidebarExpanded ? "w-64" : "w-0 overflow-hidden"
        )}
      >
        {/* Space header */}
        <div className="h-14 flex items-center gap-2 px-3 shrink-0">
          <div className="size-7 rounded-lg overflow-hidden bg-muted shrink-0">
            {space.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={space.logo}
                alt={space.name}
                className="size-7 object-cover"
              />
            ) : (
              <div className="size-7 flex items-center justify-center">
                <Bot className="size-4 text-muted-foreground" />
              </div>
            )}
          </div>
          <span className="font-semibold text-sm truncate flex-1">{space.name}</span>
        </div>

        {/* New chat */}
        <div className="p-2">
          <Button
            onClick={handleNewChat}
            variant="outline"
            size="sm"
            className="w-full gap-2"
            disabled={createSession.isPending}
          >
            <Plus className="size-3.5" />
            New Chat
          </Button>
        </div>

        {/* Sessions */}
        <ScrollArea className="flex-1 py-2">
          {!chatSessions ? (
            <div className="px-2 space-y-1">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-9 rounded-md" />
              ))}
            </div>
          ) : chatSessions.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8">
              No conversations yet
            </p>
          ) : (
            <div className="px-2 space-y-0.5">
              {chatSessions.map((s) => (
                <div
                  key={s.id}
                  className={cn(
                    "group flex items-center gap-2 px-2 py-2 rounded-md cursor-pointer text-sm transition-colors",
                    activeSessionId === s.id
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-muted/50"
                  )}
                  onClick={() => selectSession(s.id)}
                >
                  <MessageSquare className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="flex-1 truncate text-xs">{s.title}</span>
                  {user && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-5 opacity-0 group-hover:opacity-100 shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteSession.mutate({ sessionId: s.id });
                      }}
                    >
                      <Trash2 className="size-3 text-destructive" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        {/* User area */}
        <div className="p-2 space-y-1">
          {user ? (
            <div className="flex items-center gap-2 px-1">
              <Avatar className="size-6">
                <AvatarImage src={user.image ?? ""} />
                <AvatarFallback className="text-xs">{initials}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{user.name}</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="size-6"
                onClick={() => authClient.signOut()}
              >
                <LogOut className="size-3" />
              </Button>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-2 text-xs"
              onClick={() =>
                authClient.signIn.social({
                  provider: "google",
                  callbackURL: `/${space.slug}`,
                })
              }
            >
              <LogIn className="size-3.5" />
              Sign in to chat
            </Button>
          )}
        </div>
      </aside>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <div className="h-14 flex items-center gap-2 px-3 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() => setSidebarOpen((v) => !(v ?? !isMobile))}
          >
            {sidebarExpanded ? (
              <ChevronLeft className="size-4" />
            ) : (
              <ChevronRight className="size-4" />
            )}
          </Button>

          {!sidebarExpanded && (
            <div className="flex items-center gap-2">
              <div className="size-6 rounded overflow-hidden bg-muted">
                {space.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={space.logo} alt={space.name} className="size-6 object-cover" />
                ) : (
                  <Bot className="size-4 text-muted-foreground m-1" />
                )}
              </div>
              <span className="font-semibold text-sm">{space.name}</span>
            </div>
          )}

          <div className="flex-1" />

          {space.model && (
            <Badge variant="secondary" className="text-xs hidden sm:flex gap-1">
              <Bot className="size-3" />
              {space.model.model.displayName}
            </Badge>
          )}

          <Button
            variant="ghost"
            size="icon"
            className={cn("size-8", docsOpen && "bg-muted text-foreground")}
            onClick={() => setDocsOpen((v) => !v)}
            title={docsOpen ? "Back to chat" : "API documentation"}
          >
            <BookOpen className="size-4" />
          </Button>

          <a
            href={getWhatsAppUrl(
              `Hi, I have feedback about the AI chat for ${space.name} (${space.slug}).`
            )}
            target="_blank"
            rel="noopener noreferrer"
            title="Send feedback on WhatsApp"
            className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "size-8")}
          >
            <MessageCircle className="size-4" />
          </a>

          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          >
            {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </Button>
        </div>

        {docsOpen ? (
          <div
            className="flex-1 overflow-y-auto"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="max-w-4xl mx-auto px-4 py-6">
              <IntegrationDocs
                slug={space.slug}
                spaceId={space.id}
                hasComputeAccess={hasComputeAccess}
                apiKey={apiKeyRef.current}
                onKeyRegenerated={(newKey) => {
                  apiKeyRef.current = newKey;
                  setKeyReady(true);
                }}
                onSignInClick={() =>
                  authClient.signIn.social({
                    provider: "google",
                    callbackURL: `/${space.slug}`,
                  })
                }
              />
            </div>
          </div>
        ) : (
          <>
        {/* Messages */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
            {scheduleBlocked ? (
              <ScheduleGate space={space} />
            ) : !user ? (
              <LoginGate
                space={space}
                onSignIn={() =>
                  authClient.signIn.social({
                    provider: "google",
                    callbackURL: `/${space.slug}`,
                  })
                }
              />
            ) : !activeSessionId && messages.length === 0 ? (
              <WelcomeScreen
                space={space}
                onNewChat={handleNewChat}
                onOpenDocs={() => setDocsOpen(true)}
              />
            ) : null}

            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} user={user} space={space} />
            ))}

            {isCurrentSessionStreaming && streamingContent && (
              <MessageBubble
                message={{
                  id: "streaming",
                  role: "ASSISTANT",
                  content: streamingContent,
                  createdAt: new Date(),
                }}
                user={user}
                space={space}
                streaming
              />
            )}

            {isCurrentSessionStreaming && !streamingContent && (
              <div className="flex items-start gap-3">
                <div className="size-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Bot className="size-4 text-primary" />
                </div>
                <div className="flex items-center gap-1 mt-2">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="size-2 bg-muted-foreground/50 rounded-full animate-bounce"
                      style={{ animationDelay: `${i * 0.15}s` }}
                    />
                  ))}
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>
        </div>

        {/* Attached files */}
        {attachedFiles.length > 0 && (
          <div className="px-4 py-2 flex flex-wrap gap-2">
            {attachedFiles.map((f, i) => (
              <div
                key={i}
                className="flex items-center gap-1.5 px-2 py-1 bg-muted rounded-md text-xs"
              >
                <Paperclip className="size-3" />
                <span className="max-w-32 truncate">{f.name}</span>
                <button
                  onClick={() =>
                    setAttachedFiles((prev) => prev.filter((_, j) => j !== i))
                  }
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Input area */}
        <div className="">
          <div className="max-w-4xl mx-auto pb-8 px-4">
            <div className="relative flex items-end gap-2 rounded-xl bg-muted/30 p-2">
              <label className="cursor-pointer p-1.5 rounded-lg hover:bg-muted transition-colors">
                <Paperclip className="size-4 text-muted-foreground" />
                <input
                  type="file"
                  multiple
                  accept=".txt,.pdf,.json,.md,.csv"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files) onDrop(Array.from(e.target.files));
                  }}
                />
              </label>

              <Textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={
                  scheduleBlocked
                    ? `Available on ${scheduleLabel(space.subscription!.schedule)} only`
                    : `Message ${space.name}… the AI can search the web when needed`
                }
                disabled={scheduleBlocked}
                className="flex-1 resize-none border-0 shadow-none focus-visible:ring-0 min-h-[72px] max-h-48 overflow-y-auto py-2.5 px-1 text-sm bg-transparent!"
                rows={1}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
              />

              <Button
                size="icon"
                className="size-8 shrink-0 rounded-full"
                onClick={handleSend}
                disabled={scheduleBlocked || !input.trim() || isCurrentSessionStreaming || !user || !keyReady}
                title={
                  scheduleBlocked
                    ? `Available on ${scheduleLabel(space.subscription!.schedule)} only`
                    : !user
                    ? "Sign in to chat"
                    : undefined
                }
              >
                {isCurrentSessionStreaming ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ArrowUp className="size-4" />
                )}
              </Button>
            </div>
          </div>
        </div>
          </>
        )}
      </div>
    </div>
  );
}

function LoginGate({
  space,
  onSignIn,
}: {
  space: Space;
  onSignIn: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-6 text-center">
      <div className="size-16 rounded-2xl overflow-hidden bg-muted flex items-center justify-center">
        {space.logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={space.logo} alt={space.name} className="size-16 object-cover" />
        ) : (
          <Bot className="size-8 text-muted-foreground" />
        )}
      </div>
      <div>
        <h2 className="text-2xl font-bold">{space.name}</h2>
        <p className="text-muted-foreground mt-2 max-w-sm">
          Sign in to start chatting and get your personal API key for external tools.
        </p>
      </div>
      <Button size="lg" onClick={onSignIn} className="gap-2">
        <LogIn className="size-4" />
        Sign in with Google
      </Button>
    </div>
  );
}

function ScheduleGate({ space }: { space: Space }) {
  const schedule = space.subscription?.schedule ?? "every day";
  const label = scheduleLabel(schedule);

  return (
    <div className="flex flex-col items-center justify-center py-20 gap-6 text-center">
      <div className="size-16 rounded-2xl overflow-hidden bg-muted flex items-center justify-center">
        {space.logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={space.logo} alt={space.name} className="size-16 object-cover" />
        ) : (
          <Bot className="size-8 text-muted-foreground" />
        )}
      </div>
      <div>
        <h2 className="text-2xl font-bold">{space.name}</h2>
        <p className="text-muted-foreground mt-2 max-w-sm">
          This space is only available on <span className="font-medium text-foreground">{label}</span>.
          Come back then to start chatting!
        </p>
      </div>
      <div className="flex items-center gap-2 px-4 py-3 rounded-xl border bg-muted/40 text-sm text-muted-foreground">
        <CalendarX className="size-4 shrink-0" />
        <span>Access restricted by plan schedule</span>
      </div>
    </div>
  );
}

function WelcomeScreen({
  space,
  onNewChat,
  onOpenDocs,
}: {
  space: Space;
  onNewChat: () => void;
  onOpenDocs: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-6 text-center">
      <div className="size-16 rounded-2xl overflow-hidden bg-muted flex items-center justify-center">
        {space.logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={space.logo}
            alt={space.name}
            className="size-16 object-cover"
          />
        ) : (
          <Bot className="size-8 text-muted-foreground" />
        )}
      </div>
      <div>
        <h2 className="text-2xl font-bold">{space.name}</h2>
        <p className="text-muted-foreground mt-2">
          Powered by{" "}
          <span className="font-medium">
            {space.model?.model.displayName ?? "AI"}
          </span>
        </p>
      </div>
      <div className="flex items-center gap-3">
        <Button onClick={onNewChat} size="lg">
          <Plus className="size-4 mr-2" />
          Start new chat
        </Button>
        <Button onClick={onOpenDocs} variant="outline" size="lg">
          <BookOpen className="size-4 mr-2" />
          API docs
        </Button>
      </div>
    </div>
  );
}

function MessageBubble({
  message,
  user,
  space,
  streaming,
}: {
  message: Message;
  user?: { name?: string | null; image?: string | null } | null;
  space: Space;
  streaming?: boolean;
}) {
  const isUser = message.role === "USER";

  return (
    <div className={cn("flex items-start gap-3", isUser && "flex-row-reverse")}>
      <div
        className={cn(
          "size-8 rounded-full flex items-center justify-center shrink-0",
          isUser ? "bg-primary/10" : "bg-primary/10"
        )}
      >
        {isUser ? (
          user?.image ? (
            <Avatar className="size-8">
              <AvatarImage src={user.image} />
              <AvatarFallback>
                <User className="size-4" />
              </AvatarFallback>
            </Avatar>
          ) : (
            <User className="size-4 text-primary" />
          )
        ) : space.logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={space.logo}
            alt={space.name}
            className="size-8 rounded-full object-cover"
          />
        ) : (
          <Bot className="size-4 text-primary" />
        )}
      </div>

      <div
        className={cn(
          "max-w-[80%] text-sm",
          isUser
            ? "rounded-2xl rounded-tr-sm bg-muted px-4 py-3 text-foreground"
            : "bg-transparent p-0"
        )}
      >
        <MarkdownContent content={message.content} />
        {streaming && (
          <span className="inline-block w-1 h-4 bg-current animate-pulse ml-0.5" />
        )}
      </div>
    </div>
  );
}

/** Strip Qwen3 <think>…</think> reasoning blocks from output. */
function stripThinking(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, "").trimStart();
}

function MarkdownContent({ content }: { content: string }) {
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none break-words">
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        code({ className, children, ...props }) {
          const isBlock = className?.startsWith("language-");
          if (isBlock) {
            return (
              <pre className="bg-muted rounded-lg p-3 overflow-x-auto my-2">
                <code className={cn("text-xs font-mono", className)} {...props}>
                  {children}
                </code>
              </pre>
            );
          }
          return (
            <code
              className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded"
              {...props}
            >
              {children}
            </code>
          );
        },
        a({ href, children }) {
          return (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline underline-offset-2"
            >
              {children}
            </a>
          );
        },
        table({ children }) {
          return (
            <div className="overflow-x-auto my-2">
              <table className="text-xs border-collapse w-full">{children}</table>
            </div>
          );
        },
        th({ children }) {
          return (
            <th className="px-2 py-1 bg-muted font-semibold text-left">
              {children}
            </th>
          );
        },
        td({ children }) {
          return <td className="px-2 py-1">{children}</td>;
        },
      }}
    >
      {content}
    </ReactMarkdown>
    </div>
  );
}
