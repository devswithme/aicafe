"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { toast } from "sonner";
import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button, buttonVariants } from "@/components/ui/button";
import { LinkButton } from "@/components/ui/link-button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Building2,
  Upload,
  X,
  MapPin,
  Users,
  Clock,
  ArrowLeft,
  Loader2,
  Info,
  MessageCircle,
} from "lucide-react";
import { getWhatsAppUrl } from "@/lib/contact";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

const schema = z
  .object({
    name: z.string().min(2, "Minimum 2 characters").max(80),
    slug: z
      .string()
      .min(2, "Minimum 2 characters")
      .max(40)
      .regex(/^[a-z0-9-]+$/, "Only lowercase letters, numbers and hyphens"),
    logo: z.string().optional(),
    location: z.string().min(2, "Required"),
    visitorsPerDay: z.number().int().min(1).max(100000),
    openHour: z.number().int().min(0).max(23),
    closeHour: z.number().int().min(1).max(24),
  })
  .refine((d) => d.closeHour > d.openHour, {
    message: "Close hour must be after open hour",
    path: ["closeHour"],
  });

type FormValues = z.infer<typeof schema>;

export default function NewSpacePage() {
  const router = useRouter();
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      slug: "",
      logo: "",
      location: "",
      visitorsPerDay: 100,
      openHour: 8,
      closeHour: 22,
    },
  });

  const createSpace = trpc.spaces.create.useMutation({
    onSuccess: (space) => {
      toast.success("Space created! Pending approval.");
      router.push(`/dashboard/spaces/${space.slug}`);
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const onDrop = useCallback(
    (files: File[]) => {
      const file = files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        const url = e.target?.result as string;
        setLogoPreview(url);
        form.setValue("logo", url);
      };
      reader.readAsDataURL(file);
    },
    [form]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "image/*": [".png", ".jpg", ".jpeg", ".svg", ".webp"] },
    maxFiles: 1,
  });

  const watchName = form.watch("name");
  const autoSlug = watchName
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");

  const origin =
    typeof window !== "undefined" ? window.location.origin : "";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <LinkButton href="/dashboard/spaces" variant="ghost" size="icon">
          <ArrowLeft className="size-4" />
        </LinkButton>
        <div>
          <h1 className="text-2xl font-bold">Create Space</h1>
          <p className="text-muted-foreground text-sm">
            Set up a new AI inference space
          </p>
        </div>
      </div>

      <Form {...form}>
        <form
          onSubmit={form.handleSubmit((d) => createSpace.mutate(d))}
          className="space-y-6"
        >
          {/* Identity */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Building2 className="size-4" /> Identity
              </CardTitle>
              <CardDescription>Basic information about your space</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Logo drop zone */}
              <FormField
                control={form.control}
                name="logo"
                render={() => (
                  <FormItem>
                    <FormLabel>Logo</FormLabel>
                    <FormControl>
                      <div className="flex items-center gap-4">
                        <div
                          {...getRootProps()}
                          className={`relative size-20 rounded-xl border-2 border-dashed flex items-center justify-center cursor-pointer transition-colors ${
                            isDragActive
                              ? "border-primary bg-primary/5"
                              : "border-muted-foreground/30 hover:border-primary/50"
                          }`}
                        >
                          <input {...getInputProps()} />
                          {logoPreview ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={logoPreview}
                              alt="Logo"
                              className="size-full object-cover rounded-xl"
                            />
                          ) : (
                            <Upload className="size-5 text-muted-foreground" />
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {logoPreview ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setLogoPreview(null);
                                form.setValue("logo", "");
                              }}
                            >
                              <X className="size-3 mr-1" /> Remove
                            </Button>
                          ) : (
                            <>
                              <p>Drag & drop or click to upload</p>
                              <p className="text-xs mt-0.5">PNG, JPG, SVG up to 2MB</p>
                            </>
                          )}
                        </div>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Separator />

              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Space Name</FormLabel>
                    <FormControl>
                      <Input placeholder="My AI Cafe" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="slug"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Slug</FormLabel>
                    <FormControl>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center border rounded-md overflow-hidden">
                          <span className="px-3 py-2 bg-muted text-muted-foreground text-sm border-r select-none whitespace-nowrap">
                            {origin}/
                          </span>
                          <Input
                            {...field}
                            placeholder={autoSlug || "my-ai-cafe"}
                            className="border-0 rounded-none focus-visible:ring-0"
                          />
                        </div>
                        {autoSlug && field.value !== autoSlug && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => form.setValue("slug", autoSlug)}
                          >
                            Use suggested
                          </Button>
                        )}
                      </div>
                    </FormControl>
                    <FormDescription>
                      Used in URLs and API endpoints. Cannot be changed later.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Location & Hours */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <MapPin className="size-4" /> Location & Hours
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="location"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Location</FormLabel>
                    <FormControl>
                      <Input placeholder="Jakarta, Indonesia" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="openHour"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-1.5">
                        <Clock className="size-3" /> Open Hour
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={0}
                          max={23}
                          {...field}
                          onChange={(e) =>
                            field.onChange(parseInt(e.target.value))
                          }
                        />
                      </FormControl>
                      <FormDescription>0–23 (24h format)</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="closeHour"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-1.5">
                        <Clock className="size-3" /> Close Hour
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={1}
                          max={24}
                          {...field}
                          onChange={(e) =>
                            field.onChange(parseInt(e.target.value))
                          }
                        />
                      </FormControl>
                      <FormDescription>1–24 (24h format)</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          {/* Capacity */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="size-4" /> Capacity
              </CardTitle>
            </CardHeader>
            <CardContent>
              <FormField
                control={form.control}
                name="visitorsPerDay"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Expected Visitors per Day:{" "}
                      <span className="font-bold">
                        {field.value?.toLocaleString()}
                      </span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        max={100000}
                        {...field}
                        onChange={(e) =>
                          field.onChange(parseInt(e.target.value))
                        }
                      />
                    </FormControl>
                    <FormDescription>
                      Used to size your plan and infrastructure
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Info */}
          <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg text-sm text-blue-700 dark:text-blue-300">
            <Info className="size-4 shrink-0 mt-0.5" />
            <p>
              Your space will be reviewed and approved before you can add AI models
              and receive traffic. This usually takes a few minutes.
            </p>
          </div>

          <div className="flex gap-3">
            <Button type="submit" disabled={createSpace.isPending} className="flex-1">
              {createSpace.isPending && (
                <Loader2 className="size-4 mr-2 animate-spin" />
              )}
              Create Space
            </Button>
            <a
              href={getWhatsAppUrl("Hi, I need help creating an AI Cafe space.")}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(buttonVariants({ variant: "outline" }), "gap-2")}
            >
              <MessageCircle className="size-4" />
              Contact
            </a>
            <LinkButton href="/dashboard/spaces" variant="outline">
              Cancel
            </LinkButton>
          </div>
        </form>
      </Form>
    </div>
  );
}
