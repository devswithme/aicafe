"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Check, Loader2, Wallet, ExternalLink, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatIDR } from "@/lib/format";
import Link from "next/link";

type Tier = "STARTER" | "STANDARD" | "PRO";

const PACKAGES: {
  tier: Tier;
  name: string;
  price: number;
  schedule: string;
  badge?: string;
}[] = [
  {
    tier: "STARTER",
    name: "Starter",
    price: 250000,
    schedule: "Every weekend",
  },
  {
    tier: "STANDARD",
    name: "Standard",
    price: 650000,
    schedule: "Every weekday",
  },
  {
    tier: "PRO",
    name: "Pro",
    price: 950000,
    schedule: "Every day",
  },
];

type Space = {
  id: string;
  subscription?: { tier: string } | null;
};

type PendingPlan = { tier: Tier; name: string; price: number };

export function PackageSelector({
  space,
  onUpdated,
}: {
  space: Space;
  onUpdated: () => void;
}) {
  const [confirmPlan, setConfirmPlan] = useState<PendingPlan | null>(null);
  const [insufficientPlan, setInsufficientPlan] = useState<PendingPlan | null>(null);

  const { data: balanceData, refetch: refetchBalance } = trpc.payment.getBalance.useQuery();
  const deduct = trpc.payment.deductBalance.useMutation();

  const setPackage = trpc.spaces.setPackage.useMutation({
    onSuccess: () => {
      toast.success("Package activated!");
      refetchBalance();
      onUpdated();
    },
    onError: (e) => toast.error(e.message),
  });

  const balance = balanceData?.balanceIdr ?? 0;
  const trialUsagePercent =
    balanceData && balanceData.trialSecondsLimit > 0
      ? Math.min(
          100,
          Math.round((balanceData.trialSecondsUsed / balanceData.trialSecondsLimit) * 100)
        )
      : 0;

  const handleSelect = (tier: Tier, name: string, price: number) => {
    if (setPackage.isPending || deduct.isPending) return;
    if (balance < price) {
      setInsufficientPlan({ tier, name, price });
      return;
    }
    setConfirmPlan({ tier, name, price });
  };

  const confirmActivate = () => {
    if (!confirmPlan) return;
    deduct.mutate(
      { amountIdr: confirmPlan.price, description: `Package ${confirmPlan.tier} for space ${space.id}` },
      {
        onSuccess: () => {
          setPackage.mutate(
            { spaceId: space.id, tier: confirmPlan.tier },
            {
              onSuccess: () => setConfirmPlan(null),
              onError: () => setConfirmPlan(null),
            }
          );
        },
        onError: (e) => {
          toast.error(e.message);
          setConfirmPlan(null);
        },
      }
    );
  };

  const isBusy = setPackage.isPending || deduct.isPending;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-semibold">Choose Package</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Monthly billing. Balance is deducted immediately.
        </p>
      </div>

      {!space.subscription && (balanceData?.trialSecondsRemaining ?? 0) > 0 && (
        <div className="flex items-center gap-3 px-5 py-4 rounded-xl border border-primary/20 bg-primary/5">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">Free trial active</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {trialUsagePercent}% of free trial used across your spaces.
            </p>
          </div>
        </div>
      )}

      {!space.subscription && balanceData?.trialSecondsRemaining === 0 && (
        <div className="flex items-center gap-3 px-5 py-4 rounded-xl border border-dashed bg-muted/40">
          <AlertCircle className="size-4 text-muted-foreground shrink-0" />
          <p className="text-sm text-muted-foreground">
            Your one-time free trial is fully used (100%). Choose a package to continue.
          </p>
        </div>
      )}

      {/* Wallet balance banner */}
      <div className="flex items-center gap-3 px-5 py-4 rounded-xl border bg-muted/40">
        <Wallet className="size-4 text-primary shrink-0" />
        <span className="text-sm text-muted-foreground">Wallet balance:</span>
        <span className="font-semibold text-sm">{formatIDR(balance)}</span>
        <Link href="/dashboard/topup" className="ml-auto">
          <Button variant="outline" size="sm" className="gap-1.5 text-xs h-7">
            <ExternalLink className="size-3" />
            Top Up
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {PACKAGES.map((pkg) => {
          const selected = space.subscription?.tier === pkg.tier;
          const canAfford = balance >= pkg.price;
          return (
            <Card
              key={pkg.tier}
              role="button"
              tabIndex={canAfford && !selected && !isBusy ? 0 : undefined}
              className={cn(
                "relative transition-colors p-0!",
                selected && "bg-primary/5",
                !canAfford && !selected && "opacity-60",
                canAfford && !selected && !isBusy && "cursor-pointer",
                isBusy && "pointer-events-none",
              )}
              onClick={() => !selected && !isBusy && handleSelect(pkg.tier, pkg.name, pkg.price)}
              onKeyDown={(e) => {
                if ((e.key === "Enter" || e.key === " ") && !selected && !isBusy) {
                  e.preventDefault();
                  handleSelect(pkg.tier, pkg.name, pkg.price);
                }
              }}
            >
              {pkg.badge && (
                <div className="absolute -top-2.5 left-1/2 -translate-x-1/2">
                  <Badge className="text-xs px-2">{pkg.badge}</Badge>
                </div>
              )}
              <CardContent className="p-5 flex flex-col gap-4">
                <div className="flex items-center justify-end">
                  {isBusy && (deduct.variables?.description?.includes(pkg.tier) || setPackage.variables?.tier === pkg.tier) ? (
                    <Loader2 className="size-5 animate-spin text-muted-foreground" />
                  ) : selected ? (
                    <div className="size-6 rounded-full bg-primary flex items-center justify-center">
                      <Check className="size-3.5 text-primary-foreground" />
                    </div>
                  ) : (
                    <div className={cn("size-6 rounded-full", canAfford ? "bg-muted" : "bg-muted/50")} />
                  )}
                </div>

                <div>
                  <p className="font-bold text-lg">{pkg.name}</p>
                  <p className="text-2xl font-bold mt-1">
                    {formatIDR(pkg.price)}
                    <span className="text-sm font-normal text-muted-foreground">/mo</span>
                  </p>
                </div>

                <div className="space-y-1.5 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Schedule</span>
                    <span className="font-medium">{pkg.schedule}</span>
                  </div>
                  {!canAfford && !selected && (
                    <p className="text-xs text-destructive pt-1">
                      Need {formatIDR(pkg.price - balance)} more
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Confirm activation dialog */}
      <Dialog open={!!confirmPlan} onOpenChange={(o) => !o && setConfirmPlan(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Activate {confirmPlan?.name} Plan?</DialogTitle>
            <DialogDescription>
              {formatIDR(confirmPlan?.price ?? 0)} will be deducted from your wallet balance immediately.
              Your remaining balance after activation will be{" "}
              <span className="font-semibold text-foreground">
                {formatIDR(balance - (confirmPlan?.price ?? 0))}
              </span>.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setConfirmPlan(null)} disabled={isBusy}>
              Cancel
            </Button>
            <Button onClick={confirmActivate} disabled={isBusy}>
              {isBusy ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
              Confirm & Activate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Insufficient balance dialog */}
      <Dialog open={!!insufficientPlan} onOpenChange={(o) => !o && setInsufficientPlan(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="size-5 text-destructive" />
              Insufficient Balance
            </DialogTitle>
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>
                The <span className="font-semibold text-foreground">{insufficientPlan?.name}</span> plan
                costs <span className="font-semibold text-foreground">{formatIDR(insufficientPlan?.price ?? 0)}</span>,
                but your current balance is only{" "}
                <span className="font-semibold text-foreground">{formatIDR(balance)}</span>.
              </p>
              <div className="rounded-lg border bg-muted/40 px-4 py-3">
                <p className="text-xs text-muted-foreground mb-1">Amount needed</p>
                <p className="text-xl font-bold text-destructive">
                  {formatIDR((insufficientPlan?.price ?? 0) - balance)}
                </p>
              </div>
            </div>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setInsufficientPlan(null)}>
              Cancel
            </Button>
            <Link href="/dashboard/topup" onClick={() => setInsufficientPlan(null)}>
              <Button className="w-full gap-2">
                <Wallet className="size-4" />
                Top Up Now
              </Button>
            </Link>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
