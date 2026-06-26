"use client";

import { trpc } from "@/lib/trpc/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { Users, Clock, TrendingUp, Activity } from "lucide-react";
import { formatDuration, formatHour } from "@/lib/format";

export function SpaceAnalytics({ spaceId }: { spaceId: string }) {
  const { data: stats, isLoading } = trpc.analytics.spaceStats.useQuery({ spaceId });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  const hourData = Array.from({ length: 24 }, (_, h) => ({
    hour: formatHour(h),
    visitors: stats?.peakHours.find((p) => p.hour === h)?.count ?? 0,
  }));

  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const dayData = dayNames.map((day, i) => ({
    day,
    visitors: stats?.recentDays.find((d) => d.dayOfWeek === i)?.count ?? 0,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-semibold">Analytics</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Visitor activity and usage patterns for this space
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MiniStat
          title="Total Visitors"
          value={stats?.totalSessions ?? 0}
          icon={<Users className="size-4" />}
        />
        <MiniStat
          title="Active Now"
          value={stats?.activeSessions ?? 0}
          icon={<Activity className="size-4" />}
          green
        />
        <MiniStat
          title="Avg. Session"
          value={formatDuration(stats?.avgDurationSecs ?? 0)}
          icon={<Clock className="size-4" />}
          isString
        />
        <MiniStat
          title="Peak Hour"
          value={
            stats?.peakHours.length
              ? formatHour(
                  stats.peakHours.reduce((a, b) =>
                    a.count > b.count ? a : b
                  ).hour
                )
              : "—"
          }
          icon={<TrendingUp className="size-4" />}
          isString
        />
      </div>

      {/* Peak hours chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Visitors by Hour of Day</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={hourData} margin={{ left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="hour"
                tick={{ fontSize: 11 }}
                interval={2}
                className="fill-muted-foreground"
              />
              <YAxis tick={{ fontSize: 11 }} className="fill-muted-foreground" />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--background))",
                  border: "none",
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Bar dataKey="visitors" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Day of week chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Visitors by Day of Week</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={dayData} margin={{ left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="day" tick={{ fontSize: 12 }} className="fill-muted-foreground" />
              <YAxis tick={{ fontSize: 11 }} className="fill-muted-foreground" />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--background))",
                  border: "none",
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Bar dataKey="visitors" fill="hsl(var(--primary) / 0.7)" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

function MiniStat({
  title,
  value,
  icon,
  green,
  isString,
}: {
  title: string;
  value: number | string;
  icon: React.ReactNode;
  green?: boolean;
  isString?: boolean;
}) {
  return (
    <Card>
      <CardContent className="pt-4 pb-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-muted-foreground">{title}</p>
          <span className={green ? "text-green-500" : "text-muted-foreground"}>{icon}</span>
        </div>
        <p className="text-2xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}
