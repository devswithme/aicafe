"use client";

import { authClient } from "@/lib/auth-client";
import { Button, buttonVariants } from "@/components/ui/button";
import { InstagramEmbeds } from "@/components/landing/instagram-embeds";
import { getWhatsAppUrl } from "@/lib/contact";
import { cn } from "@/lib/utils";
import { ArrowRight, MapPin, MessageCircle } from "lucide-react";

const MAP_MARKERS = [
  { id: "bandung", name: "Bandung", left: "35%", top: "53%" },
  { id: "bali-1", name: "Bali", left: "91%", top: "63%" },
] as const;

const TRUSTED_LOGOS = [
  { src: "/logo/haloai.png", alt: "Halo AI" },
  { src: "/logo/assai.png", alt: "Assaí", className: "invert dark:invert-0 dark:mix-blend-screen" },
  { src: "/logo/tiketcom.png", alt: "tiket.com" },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30">
      <div className="mx-auto flex min-h-screen max-w-4xl flex-col items-center px-4 py-28">
        <main className="flex flex-1 flex-col items-center justify-center gap-10 text-center">
          <h1 className="text-4xl tracking-tighter leading-none sm:text-5xl lg:text-6xl">
            Increase space<br/>innovation
            <span className="font-bold flex gap-2 sm:gap-4 justify-center items-center"><img src="/fav.svg" className="size-8 sm:size-12 -rotate-5"/>@AI Cafe</span>
          </h1>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button
              size="lg"
              className="gap-4 min-w-42 h-10 rounded-full"
              onClick={() =>
                authClient.signIn.social({
                  provider: "google",
                  callbackURL: "/dashboard",
                })
              }
            >
              <ArrowRight />
              Get Started!
            </Button>
            <a
              href={getWhatsAppUrl()}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                buttonVariants({ variant: "outline", size: "lg" }),
                "gap-2 h-10 rounded-full min-w-42"
              )}
            >
              <MessageCircle />
              Contact
            </a>
          </div>

          <section className="mt-12 w-full text-center">
          <p className="mb-6 text-sm text-muted-foreground">Trusted by people at</p>
          <div className="flex flex-wrap items-center justify-center gap-8 sm:gap-12">
            {TRUSTED_LOGOS.map(({ src, alt, className }) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={src}
                src={src}
                alt={alt}
                className={`h-8 w-auto object-contain sm:h-10 ${className ?? ""}`}
              />
            ))}
          </div>
        </section>

          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/map.png"
              alt="Map of Java and Bali"
              className="w-full h-auto dark:invert"
            />
            {MAP_MARKERS.map(({ id, name, left, top }) => (
              <div
                key={id}
                className="absolute flex -translate-x-1/2 -translate-y-full flex-col items-center"
                style={{ left, top }}
              >
                <span className="mb-0.5 whitespace-nowrap text-[10px] font-semibold sm:text-xs">
                  {name}
                </span>
                <MapPin className="size-5 fill-primary text-primary sm:size-6" />
              </div>
            ))}
          </div>
        </main>

        <div className="mt-12 w-full">
          <InstagramEmbeds />
        </div>

        <footer className="mt-12 pt-8 text-center text-sm text-muted-foreground">
         &copy; AI Cafe by Fydemy
        </footer>
      </div>
    </div>
  );
}
