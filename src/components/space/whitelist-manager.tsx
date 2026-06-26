"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { trpc } from "@/lib/trpc/client";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import {
  Network,
  Plus,
  Trash2,
  Loader2,
  Shield,
  Info,
  Wifi,
} from "lucide-react";

const schema = z.object({
  ipRange: z
    .string()
    .min(7)
    .regex(
      /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/,
      "Enter a valid IP (e.g. 192.168.1.0/24) or single IP"
    ),
  label: z.string().max(60).optional(),
});

type FormValues = z.infer<typeof schema>;

export function WhitelistManager({ spaceId }: { spaceId: string }) {
  const { data: entries, refetch } = trpc.whitelist.list.useQuery({ spaceId });
  const add = trpc.whitelist.add.useMutation({
    onSuccess: () => {
      toast.success("IP range added");
      form.reset();
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });
  const remove = trpc.whitelist.remove.useMutation({
    onSuccess: () => {
      toast.success("IP range removed");
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { ipRange: "", label: "" },
  });

  return (
    <div className="space-y-5">
      <div>
        <h3 className="font-semibold flex items-center gap-2">
          <Shield className="size-4" /> LAN IP Whitelist
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          Restrict AI inference API access to specific networks. Users must be
          connected to whitelisted networks to use the API.
        </p>
      </div>

      {/* Info box */}
      <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg text-sm text-amber-700 dark:text-amber-400">
        <Wifi className="size-4 shrink-0 mt-0.5" />
        <p>
          When you add IP ranges here, only requests from those IP addresses will
          be allowed to use your AI inference API. Leave empty to allow all IPs.
        </p>
      </div>

      {/* Add form */}
      <Card>
        <CardContent className="pt-4 pb-5">
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit((d) =>
                add.mutate({ spaceId, ...d })
              )}
              className="space-y-3"
            >
              <div className="grid sm:grid-cols-2 gap-3">
                <FormField
                  control={form.control}
                  name="ipRange"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>IP Address or CIDR Range</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="192.168.1.0/24"
                          {...field}
                          className="font-mono"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="label"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Label (optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="Office WiFi" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <Button type="submit" disabled={add.isPending} size="sm">
                {add.isPending ? (
                  <Loader2 className="size-3.5 mr-2 animate-spin" />
                ) : (
                  <Plus className="size-3.5 mr-2" />
                )}
                Add IP Range
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      {/* Entries list */}
      {!entries || entries.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm">
          <Network className="size-8 mx-auto mb-2" />
          No IP ranges configured — all IPs are currently allowed.
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className="flex items-center gap-3 p-3 rounded-lg border bg-muted/20"
            >
              <Shield className="size-4 text-muted-foreground shrink-0" />
              <code className="font-mono text-sm flex-1">{entry.ipRange}</code>
              {entry.label && (
                <Badge variant="secondary" className="text-xs">
                  {entry.label}
                </Badge>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="size-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                disabled={remove.isPending}
                onClick={() => remove.mutate({ id: entry.id })}
              >
                {remove.isPending && remove.variables?.id === entry.id ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Trash2 className="size-3.5" />
                )}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
