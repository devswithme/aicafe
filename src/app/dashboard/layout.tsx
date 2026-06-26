"use client";

import { authClient } from "@/lib/auth-client";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import {
  LayoutDashboard,
  Building2,
  Plus,
  LogOut,
  Moon,
  Sun,
  ChevronDown,
  Wallet,
  PanelLeft,
  MessageCircle,
} from "lucide-react";
import { getWhatsAppUrl } from "@/lib/contact";
import { useTheme } from "next-themes";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";

const navItems = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/spaces", label: "Spaces", icon: Building2 },
  { href: "/dashboard/spaces/new", label: "New Space", icon: Plus },
  { href: "/dashboard/topup", label: "Wallet & Top Up", icon: Wallet },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session } = authClient.useSession();
  const { theme, setTheme } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const user = session?.user;
  const { data: walletData } = trpc.payment.getBalance.useQuery(undefined, { enabled: !!user });

  const initials = user?.name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <aside
        className={cn(
          "border-r flex flex-col shrink-0 transition-[width] duration-200",
          sidebarOpen ? "w-60" : "w-0 overflow-hidden"
        )}
      >
        {/* Logo */}
        <div className="h-14 flex items-center gap-2 px-4 border-b">
          <Link href="/" className="rounded-md transition-opacity hover:opacity-80">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" alt="AI Cafe" className="h-7 w-auto" />
          </Link>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active =
              href === "/dashboard"
                ? pathname === "/dashboard"
                : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <Icon className="size-4 shrink-0" />
                {label}
              </Link>
            );
          })}
          <a
            href={getWhatsAppUrl("Hi, I need help with AI Cafe dashboard.")}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
              "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <MessageCircle className="size-4 shrink-0" />
            Contact
          </a>
        </nav>

        {/* Wallet balance chip */}
        <Link href="/dashboard/topup" className="mx-3 mb-1 flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/5 hover:bg-primary/10 transition-colors border border-primary/10">
          <Wallet className="size-3.5 text-primary shrink-0" />
          <span className="text-xs text-muted-foreground">Balance</span>
          <span className="ml-auto text-xs font-semibold text-primary" suppressHydrationWarning>
            Rp{(walletData?.balanceIdr ?? 0).toLocaleString("id-ID")}
          </span>
        </Link>

        {/* User menu */}
        <div className="p-3 border-t">
          <DropdownMenu>
            <DropdownMenuTrigger
              className={cn(
                "w-full flex items-center gap-2 h-10 px-2 rounded-lg",
                "text-sm font-medium transition-colors",
                "hover:bg-muted focus:outline-none"
              )}
            >
              <Avatar className="size-7">
                <AvatarImage src={user?.image ?? ""} />
                <AvatarFallback className="text-xs" suppressHydrationWarning>{initials ?? "?"}</AvatarFallback>
              </Avatar>
              <div className="flex-1 text-left overflow-hidden">
                <p className="text-xs font-medium truncate" suppressHydrationWarning>{user?.name ?? "..."}</p>
                <p className="text-xs text-muted-foreground truncate" suppressHydrationWarning>{user?.email ?? ""}</p>
              </div>
              <ChevronDown className="size-3 text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              >
                {theme === "dark" ? (
                  <Sun className="size-4 mr-2" />
                ) : (
                  <Moon className="size-4 mr-2" />
                )}
                Toggle theme
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive"
                onClick={async () => {
                  await authClient.signOut();
                  router.push("/");
                }}
              >
                <LogOut className="size-4 mr-2" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        <div className="h-14 flex items-center gap-2 px-4 border-b sticky top-0 bg-background/80 backdrop-blur z-10">
          <Button
            variant="ghost"
            size="icon"
            className="size-9"
            onClick={() => setSidebarOpen((v) => !v)}
            title={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
          >
            <PanelLeft className="size-4" />
          </Button>
        </div>
        <div className="w-full max-w-5xl p-6">{children}</div>
      </main>
    </div>
  );
}
