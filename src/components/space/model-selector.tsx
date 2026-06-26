"use client";

import { trpc } from "@/lib/trpc/client";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Cpu, Check, Loader2, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import Image from "next/image";

type Space = {
  id: string;
  status: string;
  model?: { modelId: string } | null;
};

export function ModelSelector({
  space,
  onUpdated,
}: {
  space: Space;
  onUpdated: () => void;
}) {
  const { data: models, isLoading } = trpc.models.list.useQuery();
  const setModel = trpc.spaces.setModel.useMutation({
    onSuccess: () => {
      toast.success("Model configured!");
      onUpdated();
    },
    onError: (e) => toast.error(e.message),
  });

  const isApproved = space.status === "APPROVED";

  if (!isApproved) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-10 gap-3 text-center">
          <Lock className="size-8 text-muted-foreground" />
          <div>
            <p className="font-medium">Space not yet approved</p>
            <p className="text-sm text-muted-foreground mt-1">
              AI model selection is available once your space is approved.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-semibold">Select AI Model</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Choose the AI model that will power your space&apos;s inference API
        </p>
      </div>

      {isLoading ? (
        <div className="grid gap-3">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid gap-3">
          {models?.map((model) => {
            const selected = space.model?.modelId === model.id;
            return (
              <Card
                key={model.id}
                className={cn(
                  "cursor-pointer transition-colors",
                  selected && "bg-primary/5"
                )}
                onClick={() =>
                  !setModel.isPending &&
                  setModel.mutate({ spaceId: space.id, modelId: model.id })
                }
              >
                <CardContent className="flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold">{model.displayName}</p>
                  </div>
                  <div className="shrink-0">
                    {setModel.isPending && setModel.variables?.modelId === model.id ? (
                      <Loader2 className="size-5 animate-spin text-muted-foreground" />
                    ) : selected ? (
                      <div className="size-6 rounded-full bg-primary flex items-center justify-center">
                        <Check className="size-3.5 text-primary-foreground" />
                      </div>
                    ) : (
                      <div className="size-6 rounded-full bg-muted" />
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
