"use client";

import { trpc } from "@/lib/trpc/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { LinkButton } from "@/components/ui/link-button";
import {
  Building2,
  Plus,
  MapPin,
  Users,
  Clock,
  Search,
  Cpu,
  Package,
  Network,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { StatusBadge } from "../page";

export default function SpacesPage() {
  const { data: spaces, isLoading } = trpc.spaces.list.useQuery();
  const [search, setSearch] = useState("");

  const filtered = spaces?.filter(
    (s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.slug.toLowerCase().includes(search.toLowerCase()) ||
      s.location.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Spaces</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage your AI inference spaces
          </p>
        </div>
        <LinkButton href="/dashboard/spaces/new">
          <Plus className="size-4 mr-2" />
          New Space
        </LinkButton>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          placeholder="Search spaces..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-xl" />
          ))}
        </div>
      ) : filtered?.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
            <Building2 className="size-12 text-muted-foreground" />
            <div className="text-center">
              <p className="font-medium">No spaces found</p>
              <p className="text-muted-foreground text-sm mt-1">
                {search ? "Try a different search" : "Create your first space to get started"}
              </p>
            </div>
            {!search && (
              <LinkButton href="/dashboard/spaces/new">
                <Plus className="size-4 mr-2" />
                Create space
              </LinkButton>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered?.map((space) => (
            <Link key={space.id} href={`/dashboard/spaces/${space.slug}`}>
              <Card className="h-full hover:border-primary/40 transition-colors cursor-pointer group">
                <CardContent className="p-4 flex flex-col gap-3 h-full">
                  {/* Header */}
                  <div className="flex items-start gap-3">
                    <div className="size-10 rounded-xl bg-muted flex items-center justify-center overflow-hidden shrink-0">
                      {space.logo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={space.logo}
                          alt={space.name}
                          className="size-10 object-cover rounded-xl"
                        />
                      ) : (
                        <Building2 className="size-5 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate group-hover:text-primary transition-colors">
                        {space.name}
                      </p>
                      <p className="text-xs text-muted-foreground font-mono">
                        /{space.slug}
                      </p>
                    </div>
                    <StatusBadge status={space.status} />
                  </div>

                  {/* Details */}
                  <div className="space-y-1.5 text-xs text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <MapPin className="size-3" />
                      {space.location}
                    </div>
                    <div className="flex items-center gap-2">
                      <Users className="size-3" />
                      {space.visitorsPerDay.toLocaleString()} visitors/day
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="size-3" />
                      {space.openHour}:00 – {space.closeHour}:00
                    </div>
                  </div>

                  {/* Tags */}
                  <div className="flex flex-wrap gap-1.5 mt-auto pt-2 border-t">
                    {space.model ? (
                      <Badge variant="secondary" className="text-xs gap-1">
                        <Cpu className="size-2.5" />
                        {space.model.model.displayName}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs text-muted-foreground">
                        No model
                      </Badge>
                    )}
                    {space.subscription ? (
                      <Badge variant="secondary" className="text-xs gap-1">
                        <Package className="size-2.5" />
                        {space.subscription.tier.charAt(0) +
                          space.subscription.tier.slice(1).toLowerCase()}
                      </Badge>
                    ) : null}
                    {(space._count?.ipWhitelist ?? 0) > 0 && (
                      <Badge variant="secondary" className="text-xs gap-1">
                        <Network className="size-2.5" />
                        {space._count.ipWhitelist} IPs
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
