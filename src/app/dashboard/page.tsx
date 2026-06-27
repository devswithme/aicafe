"use client";

import { trpc } from "@/lib/trpc/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Building2, Users, Clock, TrendingUp, Plus, ArrowRight } from "lucide-react";
import { LinkButton } from "@/components/ui/link-button";
import { formatDuration } from "@/lib/format";
import Link from "next/link";

export default function DashboardPage() {
  const { data: overview, isLoading } = trpc.analytics.dashboardOverview.useQuery();
  const { data: spaces } = trpc.spaces.list.useQuery();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Overview</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Monitor your AI spaces and visitor activity
          </p>
        </div>
        <LinkButton href="/dashboard/spaces/new">
          <Plus className="size-4 mr-2" />
          New Space
        </LinkButton>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Spaces"
          value={overview?.totalSpaces}
          icon={<Building2 className="size-4" />}
          isLoading={isLoading}
        />
        <StatCard
          title="Active Spaces"
          value={overview?.activeSpaces}
          icon={<TrendingUp className="size-4" />}
          isLoading={isLoading}
          variant="success"
        />
        <StatCard
          title="Active Today"
          value={overview?.activeToday}
          icon={<Users className="size-4" />}
          isLoading={isLoading}
        />
        <StatCard
          title="Avg. Session"
          value={
            overview ? formatDuration(overview.avgDurationSecs) : undefined
          }
          icon={<Clock className="size-4" />}
          isLoading={isLoading}
          isString
        />
      </div>

      {/* Spaces list */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">Your Spaces</h2>
          <LinkButton href="/dashboard/spaces" variant="ghost" size="sm">
            View all <ArrowRight className="size-3 ml-1" />
          </LinkButton>
        </div>

        {!spaces ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-lg" />
            ))}
          </div>
        ) : spaces.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-10 gap-3">
              <Building2 className="size-10 text-muted-foreground" />
              <p className="text-muted-foreground text-sm">No spaces yet</p>
              <LinkButton href="/dashboard/spaces/new" size="sm">
                Create your first space
              </LinkButton>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {spaces.slice(0, 5).map((space) => (
              <Link key={space.id} href={`/dashboard/spaces/${space.slug}`}>
                <Card className="hover:bg-muted/40 transition-colors cursor-pointer">
                  <CardContent className="flex items-center gap-4 py-3 px-4">
                    <div className="size-9 rounded-lg bg-muted flex items-center justify-center shrink-0 overflow-hidden">
                      {space.logo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={space.logo} alt={space.name} className="size-9 object-cover rounded-lg" />
                      ) : (
                        <Building2 className="size-4 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{space.name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {space.location} · {space.visitorsPerDay} visitors/day
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {space.model && (
                        <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border bg-background">
                          {space.model.model.displayName}
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  icon,
  isLoading,
  variant,
  isString,
}: {
  title: string;
  value?: number | string;
  icon: React.ReactNode;
  isLoading: boolean;
  variant?: "success";
  isString?: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-1 pt-4">
        <CardTitle className="text-xs font-medium text-muted-foreground">{title}</CardTitle>
        <div className={variant === "success" ? "text-green-500" : "text-muted-foreground"}>
          {icon}
        </div>
      </CardHeader>
      <CardContent className="pb-4">
        {isLoading ? (
          <Skeleton className="h-7 w-16" />
        ) : (
          <p className="text-2xl font-bold">{value ?? 0}</p>
        )}
      </CardContent>
    </Card>
  );
}
