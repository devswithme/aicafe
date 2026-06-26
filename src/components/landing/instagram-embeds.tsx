"use client";

import { useEffect } from "react";
import Script from "next/script";

const INSTAGRAM_POSTS = [
  "https://www.instagram.com/p/DZXe85gGTGP/",
  "https://www.instagram.com/p/DZwbZoyAYiS/",
] as const;

declare global {
  interface Window {
    instgrm?: { Embeds: { process: () => void } };
  }
}

function processEmbeds() {
  window.instgrm?.Embeds.process();
}

function InstagramPost({ url }: { url: string }) {
  return (
    <div className="instagram-embed flex w-full justify-center overflow-hidden rounded-xl [&_iframe]:mx-auto [&_iframe]:!max-w-full [&_iframe]:!w-full">
      <blockquote
        className="instagram-media !m-0 w-full max-w-full min-w-0"
        data-instgrm-permalink={url}
        data-instgrm-version="14"
        style={{
          background: "transparent",
          border: 0,
          margin: 0,
          maxWidth: "100%",
          minWidth: 0,
          padding: 0,
          width: "100%",
        }}
      />
    </div>
  );
}

export function InstagramEmbeds() {
  useEffect(() => {
    processEmbeds();
  }, []);

  return (
    <section className="w-full">
      <Script
        src="https://www.instagram.com/embed.js"
        strategy="lazyOnload"
        onLoad={processEmbeds}
      />
      <div className="mx-auto grid w-full max-w-5xl grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-8">
        {INSTAGRAM_POSTS.map((url) => (
          <InstagramPost key={url} url={url} />
        ))}
      </div>
    </section>
  );
}
