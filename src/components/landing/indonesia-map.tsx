"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

type CafeLocation = {
  id: string;
  name: string;
  x: number;
  y: number;
};

const LIVE_LOCATIONS: CafeLocation[] = [
  { id: "jakarta", name: "Jakarta", x: 108, y: 198 },
  { id: "bandung", name: "Bandung", x: 168, y: 288 },
  { id: "surabaya", name: "Surabaya", x: 318, y: 212 },
  { id: "bali", name: "Bali", x: 434, y: 358 },
];

export function IndonesiaMap({ className }: { className?: string }) {
  const [activeId, setActiveId] = useState<string | null>(null);

  return (
    <div className={cn("relative w-full", className)}>
      <svg
        viewBox="0 0 480 520"
        className="w-full h-auto drop-shadow-sm"
        role="img"
        aria-label="Map of Java and Bali with AI Cafe live locations"
      >
        <defs>
          <linearGradient id="ocean" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--color-muted)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--color-muted)" stopOpacity="0.15" />
          </linearGradient>
          <linearGradient id="land" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.12" />
            <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0.22" />
          </linearGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <rect width="480" height="520" fill="url(#ocean)" rx="24" />

        {/* Java */}
        <path
          d="M 36 210 C 60 150, 140 130, 220 138 C 300 146, 360 168, 392 220 C 408 268, 388 340, 332 392 C 276 430, 196 424, 128 388 C 72 358, 40 300, 36 250 Z"
          fill="url(#land)"
          stroke="var(--color-border)"
          strokeWidth="1.5"
          className="transition-colors"
        />
        <text
          x="210"
          y="290"
          textAnchor="middle"
          fill="currentColor"
          className="text-muted-foreground text-[13px] font-medium opacity-60"
        >
          Java
        </text>

        {/* Bali */}
        <path
          d="M 392 318 C 418 296, 452 302, 468 338 C 476 372, 458 408, 424 418 C 396 426, 374 404, 378 368 C 380 342, 386 328, 392 318 Z"
          fill="url(#land)"
          stroke="var(--color-border)"
          strokeWidth="1.5"
        />
        <text
          x="424"
          y="392"
          textAnchor="middle"
          fill="currentColor"
          className="text-muted-foreground text-[12px] font-medium opacity-60"
        >
          Bali
        </text>

        {/* Location markers */}
        {LIVE_LOCATIONS.map((location) => {
          const isActive = activeId === location.id;
          return (
            <g
              key={location.id}
              className="cursor-pointer"
              onMouseEnter={() => setActiveId(location.id)}
              onMouseLeave={() => setActiveId(null)}
              onFocus={() => setActiveId(location.id)}
              onBlur={() => setActiveId(null)}
              tabIndex={0}
              role="button"
              aria-label={`${location.name} — AI Cafe live`}
            >
              <circle
                cx={location.x}
                cy={location.y}
                r={isActive ? 18 : 14}
                className="fill-primary/20 transition-all duration-300"
              />
              <circle
                cx={location.x}
                cy={location.y}
                r={isActive ? 10 : 7}
                className="fill-primary animate-pulse"
                filter="url(#glow)"
              />
              <circle
                cx={location.x}
                cy={location.y}
                r={3}
                className="fill-primary-foreground"
              />
              <text
                x={location.x}
                y={location.y - (isActive ? 26 : 22)}
                textAnchor="middle"
                fill="currentColor"
                className={cn(
                  "text-[11px] font-semibold text-foreground transition-all duration-300",
                  isActive && "text-[12px]"
                )}
              >
                {location.name}
              </text>
              {isActive && (
                <g>
                  <rect
                    x={location.x - 22}
                    y={location.y + 14}
                    width={44}
                    height={18}
                    rx={9}
                    className="fill-primary"
                  />
                  <text
                    x={location.x}
                    y={location.y + 26}
                    textAnchor="middle"
                    fill="currentColor"
                    className="text-primary-foreground text-[9px] font-bold tracking-wide"
                  >
                    LIVE
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </svg>

      <div className="absolute bottom-3 left-3 right-3 flex flex-wrap gap-2 justify-center sm:justify-start">
        {LIVE_LOCATIONS.map((location) => (
          <button
            key={location.id}
            type="button"
            onMouseEnter={() => setActiveId(location.id)}
            onMouseLeave={() => setActiveId(null)}
            onFocus={() => setActiveId(location.id)}
            onBlur={() => setActiveId(null)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border bg-background/90 px-2.5 py-1 text-xs font-medium backdrop-blur-sm transition-colors",
              activeId === location.id && "border-primary text-primary"
            )}
          >
            <span className="size-1.5 rounded-full bg-primary animate-pulse" />
            {location.name}
          </button>
        ))}
      </div>
    </div>
  );
}
