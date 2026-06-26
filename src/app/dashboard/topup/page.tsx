"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, ExternalLink, Clock, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const TOPUP_AMOUNTS = [50_000, 100_000, 250_000, 500_000, 1_000_000, 2_000_000];

const STATUS_CONFIG: Record<string, { label: string; icon: React.ReactNode; className: string }> = {
  PAID:    { label: "Paid",    icon: <CheckCircle2 className="size-3" />, className: "text-green-600 bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800" },
  PENDING: { label: "Pending", icon: <Clock className="size-3" />,        className: "text-yellow-600 bg-yellow-50 border-yellow-200 dark:bg-yellow-950/30 dark:border-yellow-800" },
  EXPIRED: { label: "Expired", icon: <XCircle className="size-3" />,      className: "text-muted-foreground bg-muted border-border" },
  FAILED:  { label: "Failed",  icon: <AlertCircle className="size-3" />,  className: "text-red-600 bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800" },
};

export default function TopUpPage() {
  const [selected, setSelected] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState("");

  const { data: balance, isLoading: balanceLoading, refetch: refetchBalance } = trpc.payment.getBalance.useQuery();
  const { data: history, isLoading: historyLoading, refetch: refetchHistory } = trpc.payment.history.useQuery({ limit: 20 });

  const createTopup = trpc.payment.createTopup.useMutation({
    onSuccess: (data) => {
      toast.success("Redirecting to payment page…");
      refetchBalance();
      refetchHistory();
      window.open(data.paymentUrl, "_blank");
    },
    onError: (e) => toast.error(e.message),
  });

  const amount = customAmount ? parseInt(customAmount.replace(/\D/g, ""), 10) : (selected ?? 0);
  const isValidAmount = amount >= 50_000;

  const handleTopup = () => {
    if (!isValidAmount) return;
    createTopup.mutate({ amountIdr: amount });
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Wallet & Top Up</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Add balance to your wallet to activate subscription plans.
        </p>
      </div>

      {/* Balance */}
      <div>
        <p className="text-sm text-muted-foreground">Current Balance</p>
          {balanceLoading ? (
            <Skeleton className="h-8 w-40 mt-1" />
          ) : (
            <p className="text-3xl font-bold">
              Rp{(balance?.balanceIdr ?? 0).toLocaleString("id-ID")}
            </p>
          )}
        </div>

      {/* Top up form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Plus className="size-4" />
            Add Balance
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            {TOPUP_AMOUNTS.map((amt) => (
              <button
                key={amt}
                onClick={() => { setSelected(amt); setCustomAmount(""); }}
                className={cn(
                  "rounded-xl border py-3 text-sm font-medium transition-all",
                  selected === amt && !customAmount
                    ? "border-primary bg-primary/5 text-primary"
                    : "hover:border-muted-foreground/40"
                )}
              >
                Rp{amt.toLocaleString("id-ID")}
              </button>
            ))}
          </div>

          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">Rp</span>
            <input
              type="text"
              inputMode="numeric"
              placeholder="Custom amount (min Rp50.000)"
              value={customAmount}
              onChange={(e) => {
                setSelected(null);
                const raw = e.target.value.replace(/\D/g, "");
                setCustomAmount(raw ? parseInt(raw, 10).toLocaleString("id-ID") : "");
              }}
              className="w-full pl-9 pr-3 py-2.5 text-sm rounded-xl border bg-background focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          <Button
            className="w-full"
            disabled={!isValidAmount || createTopup.isPending}
            onClick={handleTopup}
          >
            {createTopup.isPending ? (
              "Creating invoice…"
            ) : (
              <>
                <ExternalLink className="size-4 mr-2" />
                Pay Rp{isValidAmount ? amount.toLocaleString("id-ID") : "0"}
              </>
            )}
          </Button>
          <p className="text-xs text-muted-foreground text-center">
            Balance is credited instantly after payment.
          </p>
        </CardContent>
      </Card>

      {/* Transaction history */}
      <div className="space-y-3">
        <h2 className="font-semibold text-sm">Transaction History</h2>
        {historyLoading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}
          </div>
        ) : !history?.length ? (
          <p className="text-sm text-muted-foreground py-6 text-center border rounded-xl">
            No transactions yet.
          </p>
        ) : (
          <div className="space-y-2">
            {history.map((txn) => {
              const cfg = STATUS_CONFIG[txn.status] ?? STATUS_CONFIG.PENDING;
              return (
                <div key={txn.id} className="flex items-center gap-3 p-3 rounded-xl border bg-card">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">Rp{txn.amountIdr.toLocaleString("id-ID")}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(txn.createdAt).toLocaleDateString("id-ID", {
                        day: "numeric", month: "short", year: "numeric",
                        hour: "2-digit", minute: "2-digit",
                      })}
                    </p>
                  </div>
                  <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border", cfg.className)}>
                    {cfg.icon} {cfg.label}
                  </span>
                  {txn.xenditPaymentUrl && txn.status === "PENDING" && (
                    <a href={txn.xenditPaymentUrl} target="_blank" rel="noopener noreferrer">
                      <Button variant="ghost" size="icon" className="size-7">
                        <ExternalLink className="size-3.5" />
                      </Button>
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
