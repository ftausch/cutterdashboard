"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CutterNav } from "@/components/cutter-nav";
import { ExternalLink, TrendingUp, Film, Eye, BarChart2 } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────
interface VideoRow {
  id: string;
  platform: string;
  external_id: string;
  url: string;
  title: string | null;
  current_views: number;
  claimed_views: number | null;
  verification_status: string | null;
  discrepancy_status: string | null;
  last_scraped_at: string | null;
  proof_url: string | null;
  proof_status: string | null;
  is_flagged?: boolean;
  published_at?: string | null;
  created_at: string;
}

interface StatsData {
  videoCount: number;
  totalViews: number;
  totalEarnings: number;
  earnings30d: number;
  unbilledViews: number;
  unbilledAmount: number;
  ratePerView: number;
}

type ClipStatus =
  | "submitted"
  | "syncing"
  | "verified"
  | "partially_verified"
  | "manual_proof_required"
  | "under_review"
  | "rejected";

// ── Status computation ────────────────────────────────────────
function getClipStatus(v: VideoRow): ClipStatus {
  if (v.is_flagged) return "rejected";
  if (v.proof_status === "submitted") return "under_review";
  if (
    v.discrepancy_status === "critical_difference" ||
    v.discrepancy_status === "suspicious_difference"
  ) {
    if (!v.proof_url) return "manual_proof_required";
  }
  if (v.verification_status === "verified") return "verified";
  if (v.verification_status === "partially_verified") return "partially_verified";
  if (!v.last_scraped_at) return "submitted";
  return "syncing";
}

// ── Status config ─────────────────────────────────────────────
const STATUS_CONFIG: Record<ClipStatus, { label: string; className: string }> = {
  submitted:             { label: "Eingereicht",  className: "bg-muted/50 text-muted-foreground border border-border" },
  syncing:               { label: "⟳ Syncing",    className: "bg-blue-500/10 text-blue-400 border border-blue-500/20" },
  verified:              { label: "✓ Verifiziert", className: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" },
  partially_verified:    { label: "~ Teilweise",   className: "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20" },
  manual_proof_required: { label: "⚠ Beleg nötig", className: "bg-orange-500/10 text-orange-400 border border-orange-500/20" },
  under_review:          { label: "In Prüfung",    className: "bg-purple-500/10 text-purple-400 border border-purple-500/20" },
  rejected:              { label: "✕ Abgelehnt",   className: "bg-red-500/10 text-red-400 border border-red-500/20" },
};

// ── Platform config ───────────────────────────────────────────
const PLATFORM_LABELS: Record<string, string> = {
  youtube: "YouTube",
  tiktok: "TikTok",
  instagram: "Instagram",
  facebook: "Facebook",
};

const PLATFORM_BADGE: Record<string, string> = {
  youtube:   "bg-red-500/10 text-red-400 border border-red-500/20",
  tiktok:    "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20",
  instagram: "bg-pink-500/10 text-pink-400 border border-pink-500/20",
  facebook:  "bg-blue-500/10 text-blue-400 border border-blue-500/20",
};

const PLATFORM_ICON_BG: Record<string, string> = {
  youtube:   "bg-red-500/10 text-red-400",
  tiktok:    "bg-cyan-500/10 text-cyan-400",
  instagram: "bg-pink-500/10 text-pink-400",
  facebook:  "bg-blue-500/10 text-blue-400",
};

// ── Helpers ───────────────────────────────────────────────────
function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return new Intl.NumberFormat("de-DE").format(n);
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isThisMonth(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
}

// ── Skeleton ──────────────────────────────────────────────────
function CardSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="skeleton h-3 w-24 mb-3" />
      <div className="skeleton h-7 w-20" />
    </div>
  );
}

// ── Stat Card ─────────────────────────────────────────────────
function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <p className="mb-1 text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {label}
      </p>
      <p className="text-2xl font-bold tabular-nums">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────
export default function PerformancePage() {
  const router = useRouter();
  const [videos, setVideos] = useState<VideoRow[]>([]);
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatedAt] = useState(() => new Date().toISOString());

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      fetch("/api/videos").then((r) => {
        if (r.status === 401 || r.status === 403) { router.push("/login"); throw new Error("auth"); }
        return r.json();
      }),
      fetch("/api/stats").then((r) => {
        if (r.status === 401 || r.status === 403) { router.push("/login"); throw new Error("auth"); }
        return r.json();
      }),
    ])
      .then(([videoData, statsData]) => {
        if (cancelled) return;
        setVideos(videoData.videos ?? []);
        setStats(statsData);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [router]);

  // Derived data
  const topClips = [...videos]
    .sort((a, b) => b.current_views - a.current_views)
    .slice(0, 10);

  const viewsThisMonth = videos
    .filter((v) => isThisMonth(v.published_at ?? v.created_at))
    .reduce((sum, v) => sum + v.current_views, 0);

  const avgViews =
    videos.length > 0
      ? Math.round(videos.reduce((s, v) => s + v.current_views, 0) / videos.length)
      : 0;

  // Views by platform
  const platformViews: Record<string, number> = {};
  for (const v of videos) {
    platformViews[v.platform] = (platformViews[v.platform] ?? 0) + v.current_views;
  }
  const totalAllViews = Object.values(platformViews).reduce((s, n) => s + n, 0);
  const platformEntries = Object.entries(platformViews).sort((a, b) => b[1] - a[1]);

  // Status counts
  const statusCounts: Partial<Record<ClipStatus, number>> = {};
  for (const v of videos) {
    const s = getClipStatus(v);
    statusCounts[s] = (statusCounts[s] ?? 0) + 1;
  }

  return (
    <>
      <CutterNav />
      <main className="mx-auto max-w-5xl p-6 space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <BarChart2 className="h-6 w-6 text-primary" />
              Deine Performance
            </h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Zuletzt aktualisiert: {formatTimestamp(updatedAt)}
            </p>
          </div>
        </div>

        {/* Stats row */}
        {loading ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[...Array(4)].map((_, i) => <CardSkeleton key={i} />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard
              label="Clips gesamt"
              value={String(videos.length)}
              sub={`${videos.length === 1 ? "Video" : "Videos"} eingereicht`}
            />
            <StatCard
              label="Views gesamt"
              value={formatNum(stats?.totalViews ?? 0)}
              sub="alle Plattformen"
            />
            <StatCard
              label="Views diesen Monat"
              value={formatNum(viewsThisMonth)}
              sub={new Date().toLocaleString("de-DE", { month: "long", year: "numeric" })}
            />
            <StatCard
              label="Ø Views pro Clip"
              value={formatNum(avgViews)}
              sub={videos.length > 0 ? `aus ${videos.length} Clips` : "noch keine Clips"}
            />
          </div>
        )}

        {/* Top Clips */}
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-base font-semibold">
            <TrendingUp className="h-4 w-4 text-primary" />
            Top 10 Clips
          </h2>

          {loading ? (
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="border-b border-border px-4 py-3.5 last:border-0">
                  <div className="flex items-center gap-3">
                    <div className="skeleton h-9 w-9 rounded-lg shrink-0" />
                    <div className="flex-1">
                      <div className="skeleton h-3.5 w-48 mb-1.5" />
                      <div className="skeleton h-3 w-24" />
                    </div>
                    <div className="skeleton h-6 w-16 rounded-md" />
                  </div>
                </div>
              ))}
            </div>
          ) : topClips.length === 0 ? (
            <div className="rounded-xl border border-border bg-card flex flex-col items-center py-14 text-center">
              <Film className="mb-3 h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">Noch keine Clips eingereicht</p>
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              {topClips.map((v, idx) => {
                const status = getClipStatus(v);
                const statusCfg = STATUS_CONFIG[status];
                const platformBadge = PLATFORM_BADGE[v.platform] ?? "bg-muted text-muted-foreground border border-border";
                const platformIconBg = PLATFORM_ICON_BG[v.platform] ?? "bg-muted text-muted-foreground";
                return (
                  <div
                    key={v.id}
                    className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-0 hover:bg-accent/20 transition-colors"
                  >
                    {/* Rank + platform icon */}
                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${platformIconBg}`}>
                      {idx + 1}
                    </div>

                    {/* Title */}
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-sm font-medium">
                        {v.title || "Ohne Titel"}
                      </p>
                      <div className="mt-0.5 flex items-center gap-1.5">
                        <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${platformBadge}`}>
                          {PLATFORM_LABELS[v.platform] ?? v.platform}
                        </span>
                        <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${statusCfg.className}`}>
                          {statusCfg.label}
                        </span>
                      </div>
                    </div>

                    {/* Views */}
                    <div className="text-right shrink-0">
                      <p className="text-lg font-bold tabular-nums">
                        {formatNum(v.current_views)}
                      </p>
                      <p className="text-xs text-muted-foreground">Views</p>
                    </div>

                    {/* Link */}
                    <a
                      href={v.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-1 shrink-0 rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                      title="Öffnen"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Bottom row: Platform breakdown + Status overview */}
        <div className="grid gap-4 sm:grid-cols-2">

          {/* Views by Platform */}
          <section>
            <h2 className="mb-3 flex items-center gap-2 text-base font-semibold">
              <Eye className="h-4 w-4 text-primary" />
              Views nach Plattform
            </h2>
            <div className="rounded-xl border border-border bg-card p-4 space-y-3">
              {loading ? (
                [...Array(3)].map((_, i) => (
                  <div key={i} className="space-y-1.5">
                    <div className="flex justify-between">
                      <div className="skeleton h-3 w-20" />
                      <div className="skeleton h-3 w-12" />
                    </div>
                    <div className="skeleton h-2 w-full rounded-full" />
                  </div>
                ))
              ) : platformEntries.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Keine Daten</p>
              ) : (
                platformEntries.map(([platform, views]) => {
                  const pct = totalAllViews > 0 ? (views / totalAllViews) * 100 : 0;
                  const barColor =
                    platform === "youtube" ? "bg-red-400" :
                    platform === "tiktok" ? "bg-cyan-400" :
                    platform === "instagram" ? "bg-pink-400" :
                    "bg-blue-400";
                  return (
                    <div key={platform}>
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span className="font-medium">
                          {PLATFORM_LABELS[platform] ?? platform}
                        </span>
                        <span className="tabular-nums text-muted-foreground">
                          {formatNum(views)}
                          <span className="ml-1.5 text-xs">({pct.toFixed(0)}%)</span>
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/50">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          {/* Status overview */}
          <section>
            <h2 className="mb-3 flex items-center gap-2 text-base font-semibold">
              <Film className="h-4 w-4 text-primary" />
              Status-Übersicht
            </h2>
            <div className="rounded-xl border border-border bg-card p-4">
              {loading ? (
                <div className="flex flex-wrap gap-2">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="skeleton h-6 w-24 rounded-full" />
                  ))}
                </div>
              ) : videos.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Keine Clips</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {(Object.keys(STATUS_CONFIG) as ClipStatus[]).map((s) => {
                    const count = statusCounts[s];
                    if (!count) return null;
                    const cfg = STATUS_CONFIG[s];
                    return (
                      <span
                        key={s}
                        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${cfg.className}`}
                      >
                        {cfg.label}
                        <span className="font-bold">{count}</span>
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          </section>

        </div>
      </main>
    </>
  );
}
