import { cn } from "@/lib/utils";

export function ThemeLogo({ className }: { className?: string }) {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo.svg"
        alt="AI Cafe"
        className={cn(className, "dark:hidden")}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo_dark.svg"
        alt="AI Cafe"
        className={cn(className, "hidden dark:block")}
      />
    </>
  );
}
