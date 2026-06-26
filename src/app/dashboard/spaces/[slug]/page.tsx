"use client";

import { use } from "react";
import { trpc } from "@/lib/trpc/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LinkButton } from "@/components/ui/link-button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Building2, ArrowLeft, Cpu, Package,
  Network, BarChart3, ExternalLink, Copy, CheckCheck, BookOpen,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ModelSelector } from "@/components/space/model-selector";
import { PackageSelector } from "@/components/space/package-selector";
import { WhitelistManager } from "@/components/space/whitelist-manager";
import { SpaceAnalytics } from "@/components/space/space-analytics";
import { CustomInstructionsEditor } from "@/components/space/custom-instructions-editor";
import { SpaceQrDownload } from "@/components/space/space-qr-download";

export default function SpaceDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const { data: space, isLoading, refetch } = trpc.spaces.getBySlug.useQuery({ slug });
  const [copied, setCopied] = useState(false);

  const apiBase = `${typeof window !== "undefined" ? window.location.origin : ""}/api/v1/${slug}`;

  const copyApiKey = () => {
    navigator.clipboard.writeText(apiBase);
    setCopied(true);
    toast.success("API base URL copied!");
    setTimeout(() => setCopied(false), 2000);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (!space) {
    return (
      <div>
        <Building2 className="size-12 text-muted-foreground mb-3" />
        <p className="font-medium">Space not found</p>
        <LinkButton href="/dashboard/spaces" variant="outline" className="mt-4">
          Back to spaces
        </LinkButton>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <LinkButton href="/dashboard/spaces" variant="ghost" size="icon" className="shrink-0">
          <ArrowLeft className="size-4" />
        </LinkButton>
        <div className="flex-1 min-w-0 flex items-center gap-4">
          <div className="size-8 rounded-lg bg-muted flex items-center justify-center overflow-hidden shrink-0">
            {space.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={space.logo} alt={space.name} className="size-8 object-cover rounded-lg" />
            ) : (
              <Building2 className="size-6 text-muted-foreground" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold">{space.name}</h1>
            </div>
          </div>
        </div>
        <div className="shrink-0 flex items-center gap-2">
          <SpaceQrDownload slug={slug} spaceName={space.name} logo={space.logo} />
          <LinkButton href={`/${slug}`} variant="outline" size="sm" target="_blank">
            <ExternalLink className="size-3.5 mr-1.5" /> Open Chat
          </LinkButton>
        </div>
      </div>

      {/* API info card */}
      {space.status === "APPROVED" && (
        <Card className="bg-muted/40 border-dashed">
          <CardContent className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-muted-foreground mb-0.5">API base</p>
              <code className="text-sm font-mono truncate block font-bold">{apiBase}</code>
            </div>
            <Button variant="outline" size="sm" onClick={copyApiKey}>
              {copied ? <CheckCheck className="size-3.5 mr-1.5 text-green-500" /> : <Copy className="size-3.5 mr-1.5" />}
              Copy
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs defaultValue="model">
        <TabsList className="h-auto gap-1 w-fit">
            <TabsTrigger value="model" className="gap-1.5 px-3">
              <Cpu className="size-3.5 shrink-0" /> Model
            </TabsTrigger>
            <TabsTrigger value="package" className="gap-1.5 px-3">
              <Package className="size-3.5 shrink-0" /> Package
            </TabsTrigger>
            <TabsTrigger value="instructions" className="gap-1.5 px-3">
              <BookOpen className="size-3.5 shrink-0" /> Instructions
            </TabsTrigger>
            <TabsTrigger value="whitelist" className="gap-1.5 px-3" disabled={space.status !== "APPROVED"}>
              <Network className="size-3.5 shrink-0" /> Whitelist
            </TabsTrigger>
            <TabsTrigger value="analytics" className="gap-1.5 px-3">
              <BarChart3 className="size-3.5 shrink-0" /> Analytics
            </TabsTrigger>
          </TabsList>

        <TabsContent value="model" className="mt-6">
          <ModelSelector space={space} onUpdated={refetch} />
        </TabsContent>

        <TabsContent value="package" className="mt-6">
          <PackageSelector space={space} onUpdated={refetch} />
        </TabsContent>

        <TabsContent value="instructions" className="mt-6">
          <CustomInstructionsEditor space={space} onUpdated={refetch} />
        </TabsContent>

        <TabsContent value="whitelist" className="mt-6">
          <WhitelistManager spaceId={space.id} />
        </TabsContent>

        <TabsContent value="analytics" className="mt-6">
          <SpaceAnalytics spaceId={space.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
