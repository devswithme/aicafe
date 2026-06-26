"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { downloadSpaceQr, generateSpaceQrPng } from "@/lib/generate-space-qr";
import { Download, Loader2, QrCode } from "lucide-react";
import { toast } from "sonner";

type SpaceQrDownloadProps = {
  slug: string;
  spaceName: string;
  logo: string | null;
};

export function SpaceQrDownload({ slug, spaceName, logo }: SpaceQrDownloadProps) {
  const [open, setOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const chatUrl =
    typeof window !== "undefined" ? `${window.location.origin}/${slug}` : `/${slug}`;

  const loadPreview = async () => {
    setLoading(true);
    try {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      const blob = await generateSpaceQrPng({ chatUrl, spaceName, logo });
      setPreviewUrl(URL.createObjectURL(blob));
    } catch {
      toast.error("Failed to generate QR code");
      setOpen(false);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) {
      void loadPreview();
    } else if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
  };

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await downloadSpaceQr({
        chatUrl,
        spaceName,
        logo,
        filename: `${slug}-qr-code.png`,
      });
      toast.success("QR code downloaded");
    } catch {
      toast.error("Failed to download QR code");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <QrCode className="size-3.5 mr-1.5" />
        QR Code
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Print-ready QR code</DialogTitle>
          <DialogDescription>
            3:4 poster with your logo in the center and AI Cafe watermark below.
          </DialogDescription>
        </DialogHeader>

        <div className="mx-auto w-full max-w-[270px] overflow-hidden rounded-xl border bg-muted/30">
          <div className="relative aspect-[3/4] w-full">
            {loading ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="size-6 animate-spin text-muted-foreground" />
              </div>
            ) : previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl}
                alt={`${spaceName} QR code`}
                className="h-full w-full object-contain"
              />
            ) : null}
          </div>
        </div>

        <DialogFooter>
          <Button onClick={handleDownload} disabled={loading || downloading}>
            {downloading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Download className="size-4" />
            )}
            Download PNG
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
