"use client";

import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { BookOpen, Loader2 } from "lucide-react";

type Space = {
  id: string;
  name: string;
  customInstructions: string | null;
};

export function CustomInstructionsEditor({
  space,
  onUpdated,
}: {
  space: Space;
  onUpdated: () => void;
}) {
  const [value, setValue] = useState(space.customInstructions ?? "");

  useEffect(() => {
    setValue(space.customInstructions ?? "");
  }, [space.customInstructions]);

  const save = trpc.spaces.setCustomInstructions.useMutation({
    onSuccess: () => {
      toast.success("Custom instructions saved!");
      onUpdated();
    },
    onError: (e) => toast.error(e.message),
  });

  const dirty = value !== (space.customInstructions ?? "");

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-semibold flex items-center gap-2">
          <BookOpen className="size-4" />
          Custom Instructions
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          Teach the AI about your cafe — menu highlights, WiFi password, opening hours,
          house rules, location tips, etc. This is injected into every chat and API request
          for this space.
        </p>
      </div>

      <Textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={`Example:\n\nWe are ${space.name}, a specialty coffee shop in Jakarta.\n- Signature drink: iced pandan latte\n- Free WiFi password: cafe2024\n- Quiet zone on the 2nd floor\n- We close kitchen at 21:00`}
        className="min-h-[220px] resize-y text-sm"
        maxLength={8000}
      />

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">{value.length} / 8000</p>
        <Button
          onClick={() =>
            save.mutate({
              spaceId: space.id,
              customInstructions: value.trim() || null,
            })
          }
          disabled={!dirty || save.isPending}
        >
          {save.isPending ? (
            <>
              <Loader2 className="size-4 mr-2 animate-spin" />
              Saving…
            </>
          ) : (
            "Save instructions"
          )}
        </Button>
      </div>
    </div>
  );
}
