"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { CutterNav } from "@/components/cutter-nav";
import {
  ArrowLeft,
  RefreshCw,
  Flag,
  ExternalLink,
  Film,
  TrendingUp,
} from "lucide-react";

interface Episode {
  id: string | null;
  title: string | null;
  description: string | null;
  platform: string | null;
  created_at: string | null;
  cutter_id: string | null;
  cutter_name: string | null;
}

interface Clip {
  id: string | null;
  platform: string | null;
  url: string | null;
  title: string | null;
  current_views: number | null;
  claimed_views: number | null;
  observed_views: number | null;
  api_views: number | null;
  verification_status: string | null;
  verification_source: string | null;
  confidence_level: number | null;
  discrepancy_status: string | null;
  discrepancy_percent: number | null;
  is_flagged: number;
  last_scraped_at: string | null;
  created_at: string | null;
  cutter_name: string | null;
}

interface Aggregates {
  total_clips: number;
  total_verified_views: number;
  total_claimed_views: number;
  tiktok_views: number;
  youtube_views: number;
  instagram_views: number;
  facebook_views: number;
  verified_count: number;
  flagged_count: number;
}

interface CutterBreakdownItem {
  name: string;
  clips: number;
  views: number;
}

interface EpisodeResponse {
  episode: Episode;
  clips: Clip[];
  aggregates: Aggregates;
  cutterBreakdown: CutterBreakdownItem[];
}

const PLATFORM_LABELS: Record<string, string> = {
  youtube: "YouTube",
  tiktok: "TikTok",
  instagram: "Instagram",
  facebook: "Facebook",
};

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  verified: { label: "Verifiziert", cls: "bg-emerald-500/10 text-emerald-400" },
  partially_verified: { label: "Teilweise", cls: "bg-yellow-500/10 text-yellow-400" },
  unverified: { label: "Ausstehend", cls: "bg-muted/50 text-muted-foreground" },
  claimed_only: { label: "Nur Angabe", cls: "bg-orange-500/10 text-orange-400" },
  manual_proof: { label: "Beleg", cls: "bg-blue-500/10 text-blue-400" },
  unavailable: { label: "—", cls: "bg-muted/50 text-muted-foreground" },
};

const DISC_LABELS: Record<string, { label: string; cls: string }> = {
  match: { label: "Match", cls: "text-emerald-400" },
  minor_difference: { label: "Gering", cls: "text-yellow-400" },
  suspicious_difference: { label: "Verdächtig", cls: "text-orange-400" },
  critical_difference: { label: "Kritisch", cls: "text-red-400" },
  no_data: { label: "—", cls: "text-muted-foreground" },
};

const RANK_BADGES = ["🥇", "🥈", "🥉"];

function formatNum(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  return new Intl.NumberFormat("de-DE").format(n);
}

function formatRelative(dateStr: string | null): string {
  if (!dateStr) return "—";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `vor ${mins}min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `vor ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "gestern";
  return `vor ${days} Tagen`;
}

function formatDateTime(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("de-DE", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });
}

export default function EpisodePerformancePage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [data, setData] = useState<EpisodeResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/ops/episodes/${id}`);
    if (res.status === 401) { router.push("/login"); return; }
    if (res.status === 403) { router.push("/dashboard"); return; }
    if (res.status === 404) { router.push("/ops/clips"); return; }
    const json = await res.json();
    setData(json);
    setLoading(false);
  }, [id, router]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <>
        <CutterNav />
        <main className="mx-auto max-w-5xl px-6 py-8 space-y-6">
          <div className="skeleton h-4 w-24" />
          <div className="rounded-xl border border-border bg-card p-5 space-y-3">
            <div className="skeleton h-6 w-64" />
            <div className="skeleton h-4 w-40" />
          </div>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-border bg-card p-4 space-y-2">
                <div className="skeleton h-4 w-16" />
                <div className="skeleton h-7 w-12" />
              </div>
            ))}
          </div>
        </main>
      </>
    );
  }

  if (!data) return null;

  const { episode, clips, aggregates, cutterBreakdown } = data;

  const totalViews = aggregates.total_verified_views;
  const claimedViews = aggregates.total_claimed_views;
  const diffPct = claimedViews > 0
    ? Math.round(((totalViews - claimedViews) / claimedViews) * 100)
    : 0;

  const platformStats = [
    { key: "tiktok", views: aggregates.tiktok_views },
    { key: "youtube", views: aggregates.youtube_views },
    { key: "instagram", views: aggregates.instagram_views },
    { key: "facebook", views: aggregates.facebook_views },
  ].filter(p => p.views > 0).sort((a, b) => b.views - a.views);

  const maxPlatformViews = Math.max(...platformStats.map(p => p.views), 1);

  return (
    <>
      <CutterNav />
      <main className="mx-auto max-w-5xl px-6 py-8 space-y-6">
        {/* Back */}
        <Link
          href="/ops/clips"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Zurück zu Clips
        </Link>

        {/* Header */}
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <Film className="h-5 w-5 text-primary shrink-0" />
                <h1 className="text-xl font-bold truncate">{episode.title ?? "Unbekannte Episode"}</h1>
              </div>
              <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
                {episode.cutter_name && (
                  <Link
                    href={`/ops/cutters/${episode.cutter_id}`}
                    className="hover:text-primary transition-colors"
                  >
                    Cutter: <span className="font-medium text-foreground">{episode.cutter_name}</span>
                  </Link>
                )}
                {episode.created_at && (
                  <span>Erstellt: {formatDateTime(episode.created_at)}</span>
                )}
              </div>
            </div>
            <button
              onClick={load}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm hover:bg-accent transition-colors"
            >
              <RefreshCw className="h-4 w-4" />
              Aktualisieren
            </button>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="mb-2 text-muted-foreground">
              <Film className="h-4 w-4" />
            </div>
            <p className="text-2xl font-bold">{aggregates.total_clips}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Clips gesamt</p>
          </div>
          <div className="rounded-xl border border-emerald-500/20 bg-card p-4">
            <div className="mb-2 text-emerald-400">
              <TrendingUp className="h-4 w-4" />
            </div>
            <p className="text-2xl font-bold">{formatNum(totalViews)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Verifizierte Views</p>
          </div>
          <div className="rounded-xl border border-orange-500/20 bg-card p-4">
            <div className="mb-2 text-orange-400">
              <TrendingUp className="h-4 w-4" />
            </div>
            <p className="text-2xl font-bold">{formatNum(claimedViews)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Angegebene Views</p>
          </div>
          <div className={`rounded-xl border bg-card p-4 ${
            diffPct < -20
              ? "border-red-500/20"
              : diffPct < 0
              ? "border-yellow-500/20"
              : "border-emerald-500/20"
          }`}>
            <div className={`mb-2 ${
              diffPct < -20 ? "text-red-400" : diffPct < 0 ? "text-yellow-400" : "text-emerald-400"
            }`}>
              <TrendingUp className="h-4 w-4" />
            </div>
            <p className={`text-2xl font-bold ${
              diffPct < -20 ? "text-red-400" : diffPct < 0 ? "text-yellow-400" : "text-emerald-400"
            }`}>
              {diffPct > 0 ? "+" : ""}{diffPct}%
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">Verif. vs. Angabe</p>
          </div>
        </div>

        {/* Platform split */}
        {platformStats.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <h2 className="font-semibold text-sm">Plattform-Verteilung</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {platformStats.map((p) => {
                const pct = Math.round((p.views / (totalViews || 1)) * 100);
                const barPct = Math.round((p.views / maxPlatformViews) * 100);
                return (
                  <div key={p.key} className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{PLATFORM_LABELS[p.key] ?? p.key}</span>
                      <span className="text-muted-foreground">
                        {formatNum(p.views)} · {pct}%
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${barPct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Top clips table */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-5 py-3 border-b border-border">
            <h2 className="font-semibold text-sm">Top Clips ({clips.length})</h2>
          </div>
          {clips.length === 0 ? (
            <div className="px-5 py-12 text-center text-muted-foreground">
              <Film className="h-8 w-8 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Keine Clips vorhanden</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="px-3 py-2.5 text-center font-medium text-muted-foreground w-10">#</th>
                    <th className="px-3 py-2.5 text-left font-medium text-muted-foreground max-w-48">Clip</th>
                    <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Plattform</th>
                    <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Cutter</th>
                    <th className="px-3 py-2.5 text-right font-medium text-muted-foreground">Views</th>
                    <th className="px-3 py-2.5 text-right font-medium text-muted-foreground">Angabe</th>
                    <th className="px-3 py-2.5 text-right font-medium text-muted-foreground">Disc.%</th>
                    <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {clips.map((clip, index) => {
                    const isCritical = clip.discrepancy_status === "critical_difference";
                    const isSuspicious = clip.discrepancy_status === "suspicious_difference";
                    const rowCls = isCritical
                      ? "border-l-2 border-red-500 hover:bg-muted/30"
                      : isSuspicious
                      ? "border-l-2 border-amber-500 hover:bg-muted/30"
                      : "hover:bg-muted/30";
                    const statusCfg = STATUS_CONFIG[clip.verification_status ?? ""] ?? STATUS_CONFIG.unavailable;
                    const discCfg = DISC_LABELS[clip.discrepancy_status ?? ""] ?? DISC_LABELS.no_data;

                    return (
                      <tr key={clip.id} className={rowCls}>
                        <td className="px-3 py-3 text-center text-sm">
                          {index < 3 ? (
                            <span title={`#${index + 1}`}>{RANK_BADGES[index]}</span>
                          ) : (
                            <span className="text-xs text-muted-foreground">{index + 1}</span>
                          )}
                        </td>
                        <td className="px-3 py-3 max-w-48">
                          {clip.url ? (
                            <Link href={`/ops/clips/${clip.id}`} className="flex items-center gap-1 group">
                              <span className="truncate text-xs group-hover:text-primary transition-colors" title={clip.title ?? ""}>
                                {clip.title ?? clip.url}
                              </span>
                              <a
                                href={clip.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={e => e.stopPropagation()}
                                className="shrink-0 opacity-40 hover:opacity-100"
                              >
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            </Link>
                          ) : (
                            <Link
                              href={`/ops/clips/${clip.id}`}
                              className="text-xs hover:text-primary transition-colors truncate block"
                              title={clip.title ?? ""}
                            >
                              {clip.title ?? "—"}
                            </Link>
                          )}
                          {clip.is_flagged ? (
                            <span className="text-xs text-red-400 flex items-center gap-0.5 mt-0.5">
                              <Flag className="h-3 w-3" /> Geflaggt
                            </span>
                          ) : null}
                        </td>
                        <td className="px-3 py-3">
                          <span className="rounded bg-muted px-1.5 py-0.5 text-xs">
                            {PLATFORM_LABELS[clip.platform ?? ""] ?? clip.platform ?? "—"}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-xs text-muted-foreground">
                          {clip.cutter_name ?? "—"}
                        </td>
                        <td className="px-3 py-3 text-right text-xs font-mono">
                          {formatNum(clip.current_views)}
                        </td>
                        <td className="px-3 py-3 text-right text-xs font-mono">
                          {formatNum(clip.claimed_views)}
                        </td>
                        <td className="px-3 py-3 text-right text-xs">
                          {clip.discrepancy_percent != null ? (
                            <span className={discCfg.cls}>
                              {clip.discrepancy_percent > 0 ? "+" : ""}
                              {clip.discrepancy_percent.toFixed(1)}%
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${statusCfg.cls}`}>
                            {statusCfg.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Cutter breakdown (only if multiple) */}
        {cutterBreakdown.length > 1 && (
          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <h2 className="font-semibold text-sm">Cutter-Übersicht</h2>
            <div className="space-y-3">
              {cutterBreakdown.map((c) => {
                const pct = totalViews > 0 ? Math.round((c.views / totalViews) * 100) : 0;
                return (
                  <div key={c.name} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{c.name}</span>
                      <span className="text-muted-foreground text-xs">
                        {c.clips} Clips · {formatNum(c.views)} Views · {pct}%
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary/70 transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Bottom spacer */}
        <div className="h-4" />
      </main>
    </>
  );
}
