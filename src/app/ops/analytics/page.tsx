"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CutterNav } from "@/components/cutter-nav";
import {
  BarChart2,
  TrendingUp,
  Film,
  Users,
  RefreshCw,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  X,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface OverallStats {
  total_clips: number;
  total_verified_views: number;
  total_claimed_views: number;
  avg_confidence: number;
  verified_clips: number;
  flagged_clips: number;
}

interface BreakdownRow {
  clips: number;
  views: number;
  claimed_views?: number;
  avg_views?: number;
  avg_confidence?: number;
  avg_views_per_clip?: number;
  [key: string]: string | number | null | undefined;
}

interface TopClip {
  id: string | null;
  title: string | null;
  url: string | null;
  platform: string | null;
  current_views: number | null;
  claimed_views: number | null;
  verification_status: string | null;
  discrepancy_status: string | null;
  discrepancy_percent: number | null;
  cutter_name: string | null;
  hook_type: string | null;
  content_angle: string | null;
  clip_length_bucket: string | null;
  topic: string | null;
  guest: string | null;
  episode_title: string | null;
}

interface EpisodeRow {
  id: string | null;
  title: string | null;
  platform: string | null;
  created_at: string | null;
  clip_count: number;
  total_views: number;
  claimed_views: number;
  cutter_name: string | null;
}

interface AnalyticsData {
  overall: OverallStats;
  byPlatform: BreakdownRow[];
  byCutter: BreakdownRow[];
  byHookType: BreakdownRow[];
  byContentAngle: BreakdownRow[];
  byLengthBucket: BreakdownRow[];
  byCtaType: BreakdownRow[];
  byTopic: BreakdownRow[];
  topClips: TopClip[];
  recentEpisodes: EpisodeRow[];
  filters: { platform: string | null; cutterId: string | null; topic: string | null; dateFrom: string | null; dateTo: string | null };
}

// ── Labels ────────────────────────────────────────────────────────────────────

const PLATFORM_LABELS: Record<string, string> = {
  youtube: "YouTube", tiktok: "TikTok", instagram: "Instagram", facebook: "Facebook",
};

const HOOK_TYPE_LABELS: Record<string, string> = {
  question: "Frage", statement: "Statement", story: "Story", contrarian: "Kontrovers",
  how_to: "How-to", list: "Liste", other: "Sonstiges",
};

const ANGLE_LABELS: Record<string, string> = {
  educational: "Edukativ", entertainment: "Unterhaltung", opinion: "Meinung",
  case_study: "Case Study", behind_scenes: "Hinter den Kulissen", other: "Sonstiges",
};

const LENGTH_LABELS: Record<string, string> = {
  under_30s: "< 30 Sek.", "30_60s": "30–60 Sek.", "60_90s": "60–90 Sek.",
  "90_120s": "90–120 Sek.", over_120s: "> 120 Sek.",
};

const CTA_LABELS: Record<string, string> = {
  subscribe: "Abonnieren", follow: "Folgen", link_in_bio: "Link in Bio",
  comment: "Kommentar", share: "Teilen", podcast_link: "Podcast-Link",
  none: "Kein CTA", other: "Sonstiges",
};

const DISC_LABELS: Record<string, { label: string; cls: string }> = {
  match: { label: "Match", cls: "text-emerald-400" },
  minor_difference: { label: "Gering", cls: "text-yellow-400" },
  suspicious_difference: { label: "Verdächtig", cls: "text-orange-400" },
  critical_difference: { label: "Kritisch", cls: "text-red-400" },
};

const RANK_BADGES = ["🥇", "🥈", "🥉"];

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatNum(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  return new Intl.NumberFormat("de-DE").format(n);
}

function formatDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className={`rounded-xl border bg-card p-4 ${accent ? `border-${accent}/20` : "border-border"}`}>
      {accent && (
        <div className={`mb-2 text-${accent}`}>
          <TrendingUp className="h-4 w-4" />
        </div>
      )}
      <p className={`text-2xl font-bold ${accent ? `text-${accent}` : ""}`}>{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
      {sub && <p className="text-xs text-muted-foreground/60 mt-0.5">{sub}</p>}
    </div>
  );
}

function BarRow({
  label,
  value,
  maxValue,
  secondary,
  onClick,
  active,
}: {
  label: string;
  value: number;
  maxValue: number;
  secondary?: string;
  onClick?: () => void;
  active?: boolean;
}) {
  const pct = maxValue > 0 ? Math.round((value / maxValue) * 100) : 0;
  return (
    <div
      className={`space-y-1 ${onClick ? "cursor-pointer rounded-lg p-1.5 -mx-1.5 hover:bg-muted/40 transition-colors" : ""} ${active ? "bg-primary/5" : ""}`}
      onClick={onClick}
    >
      <div className="flex items-center justify-between text-sm">
        <span className={`font-medium truncate ${active ? "text-primary" : ""}`}>{label}</span>
        <span className="text-muted-foreground text-xs whitespace-nowrap ml-2">{secondary}</span>
      </div>
      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${active ? "bg-primary" : "bg-primary/60"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function SectionCard({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-5 py-3 text-sm font-semibold hover:bg-muted/30 transition-colors"
      >
        {title}
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>
      {open && <div className="px-5 pb-5 pt-1 space-y-3 border-t border-border">{children}</div>}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const router = useRouter();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  // Filter state
  const [platform, setPlatform] = useState<string>("");
  const [cutterId, setCutterId] = useState<string>("");
  const [topic, setTopic] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");

  // Tracks if we have a pending fetch triggered by filter changes
  const pendingFetch = useRef(false);

  const load = useCallback(async (params?: {
    platform?: string; cutterId?: string; topic?: string; dateFrom?: string; dateTo?: string;
  }) => {
    setLoading(true);
    const p = params ?? { platform, cutterId, topic, dateFrom, dateTo };
    const qs = new URLSearchParams();
    if (p.platform) qs.set("platform", p.platform);
    if (p.cutterId) qs.set("cutter_id", p.cutterId);
    if (p.topic) qs.set("topic", p.topic);
    if (p.dateFrom) qs.set("date_from", p.dateFrom);
    if (p.dateTo) qs.set("date_to", p.dateTo);

    const res = await fetch(`/api/ops/analytics?${qs}`);
    if (res.status === 401) { router.push("/login"); return; }
    if (res.status === 403) { router.push("/dashboard"); return; }
    const json = await res.json();
    setData(json);
    setLoading(false);
  }, [platform, cutterId, topic, dateFrom, dateTo, router]);

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function applyFilters() {
    load({ platform, cutterId, topic, dateFrom, dateTo });
  }

  function clearFilters() {
    setPlatform(""); setCutterId(""); setTopic(""); setDateFrom(""); setDateTo("");
    load({ platform: "", cutterId: "", topic: "", dateFrom: "", dateTo: "" });
  }

  const hasFilters = !!(platform || cutterId || topic || dateFrom || dateTo);

  // Drill-down: clicking a topic bar filters by that topic
  function drillTopic(t: string) {
    const newTopic = topic === t ? "" : t;
    setTopic(newTopic);
    load({ platform, cutterId, topic: newTopic, dateFrom, dateTo });
  }

  function drillPlatform(p: string) {
    const newPlatform = platform === p ? "" : p;
    setPlatform(newPlatform);
    load({ platform: newPlatform, cutterId, topic, dateFrom, dateTo });
  }

  const maxPlatformViews = Math.max(...(data?.byPlatform?.map(r => (r.views as number) ?? 0) ?? []), 1);
  const maxCutterViews   = Math.max(...(data?.byCutter?.map(r => (r.views as number) ?? 0) ?? []), 1);
  const maxHookViews     = Math.max(...(data?.byHookType?.map(r => (r.views as number) ?? 0) ?? []), 1);
  const maxAngleViews    = Math.max(...(data?.byContentAngle?.map(r => (r.views as number) ?? 0) ?? []), 1);
  const maxLengthViews   = Math.max(...(data?.byLengthBucket?.map(r => (r.views as number) ?? 0) ?? []), 1);
  const maxCtaViews      = Math.max(...(data?.byCtaType?.map(r => (r.views as number) ?? 0) ?? []), 1);
  const maxTopicViews    = Math.max(...(data?.byTopic?.map(r => (r.views as number) ?? 0) ?? []), 1);

  return (
    <>
      <CutterNav />
      <main className="mx-auto max-w-6xl px-6 py-8 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <BarChart2 className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-bold">Content Analytics</h1>
          </div>
          <button
            onClick={() => load()}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm hover:bg-accent transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Aktualisieren
          </button>
        </div>

        {/* Filter bar */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={platform}
              onChange={e => setPlatform(e.target.value)}
              className="h-8 rounded-lg border border-input bg-background px-2 text-xs outline-none focus:border-primary"
            >
              <option value="">Alle Plattformen</option>
              <option value="tiktok">TikTok</option>
              <option value="youtube">YouTube</option>
              <option value="instagram">Instagram</option>
              <option value="facebook">Facebook</option>
            </select>

            <input
              value={topic}
              onChange={e => setTopic(e.target.value)}
              placeholder="Topic filtern…"
              className="h-8 rounded-lg border border-input bg-background px-3 text-xs outline-none focus:border-primary w-36"
            />

            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span>Von</span>
              <input
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                className="h-8 rounded-lg border border-input bg-background px-2 text-xs outline-none focus:border-primary"
              />
              <span>bis</span>
              <input
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                className="h-8 rounded-lg border border-input bg-background px-2 text-xs outline-none focus:border-primary"
              />
            </div>

            <button
              onClick={applyFilters}
              disabled={loading}
              className="h-8 rounded-lg bg-primary/15 px-3 text-xs text-primary hover:bg-primary/25 transition-colors disabled:opacity-50"
            >
              Anwenden
            </button>

            {hasFilters && (
              <button
                onClick={clearFilters}
                className="flex h-8 items-center gap-1 rounded-lg border border-border px-2 text-xs text-muted-foreground hover:bg-accent transition-colors"
              >
                <X className="h-3 w-3" />
                Filter zurücksetzen
              </button>
            )}
          </div>

          {hasFilters && (
            <div className="flex flex-wrap gap-1.5">
              {platform && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                  {PLATFORM_LABELS[platform] ?? platform}
                </span>
              )}
              {topic && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                  Topic: {topic}
                </span>
              )}
              {(dateFrom || dateTo) && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                  {dateFrom || "…"} → {dateTo || "heute"}
                </span>
              )}
            </div>
          )}
        </div>

        {loading && !data ? (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-border bg-card p-4 space-y-2">
                <div className="skeleton h-4 w-16" />
                <div className="skeleton h-7 w-20" />
              </div>
            ))}
          </div>
        ) : data ? (
          <>
            {/* Overall stats */}
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
              <StatCard label="Clips gesamt" value={String(data.overall.total_clips)} />
              <StatCard
                label="Verifizierte Views"
                value={formatNum(data.overall.total_verified_views)}
                accent="emerald-400"
              />
              <StatCard
                label="Angegebene Views"
                value={formatNum(data.overall.total_claimed_views)}
                accent="orange-400"
              />
              <StatCard
                label="Verifizierte Clips"
                value={`${data.overall.verified_clips} / ${data.overall.total_clips}`}
                sub={data.overall.total_clips > 0 ? `${Math.round((data.overall.verified_clips / data.overall.total_clips) * 100)}% verifiziert` : undefined}
              />
              <StatCard
                label="Durchschn. Konfidenz"
                value={`${data.overall.avg_confidence}/100`}
              />
              <StatCard
                label="Flagged Clips"
                value={String(data.overall.flagged_clips)}
                accent={data.overall.flagged_clips > 0 ? "red-400" : undefined}
              />
            </div>

            {/* Platform breakdown */}
            {data.byPlatform.length > 0 && (
              <SectionCard title={`Plattform-Verteilung (${data.byPlatform.length})`}>
                <div className="grid gap-3 sm:grid-cols-2">
                  {data.byPlatform.map(row => (
                    <BarRow
                      key={String(row.platform)}
                      label={PLATFORM_LABELS[String(row.platform)] ?? String(row.platform ?? "—")}
                      value={row.views as number}
                      maxValue={maxPlatformViews}
                      secondary={`${formatNum(row.views as number)} Views · ${row.clips} Clips`}
                      onClick={() => drillPlatform(String(row.platform))}
                      active={platform === String(row.platform)}
                    />
                  ))}
                </div>
              </SectionCard>
            )}

            {/* Cutter breakdown */}
            {data.byCutter.length > 0 && (
              <SectionCard title={`Cutter-Performance (${data.byCutter.length})`}>
                <div className="space-y-3">
                  {data.byCutter.map(row => (
                    <div key={String(row.cutter_id)} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <Link
                          href={`/ops/cutters/${row.cutter_id}`}
                          className="font-medium hover:text-primary transition-colors"
                        >
                          {String(row.cutter_name ?? "—")}
                        </Link>
                        <span className="text-xs text-muted-foreground">
                          {row.clips} Clips · {formatNum(row.views as number)} Views · Ø {formatNum(Math.round(row.avg_views_per_clip as number))}
                        </span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary/70 transition-all"
                          style={{ width: `${maxCutterViews > 0 ? Math.round(((row.views as number) / maxCutterViews) * 100) : 0}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </SectionCard>
            )}

            {/* Content attributes split */}
            <div className="grid gap-6 lg:grid-cols-2">

              {/* Hook type */}
              {data.byHookType.length > 0 && (
                <SectionCard title="Hook-Typ Performance">
                  <div className="space-y-2.5">
                    {data.byHookType.map(row => (
                      <BarRow
                        key={String(row.hook_type)}
                        label={HOOK_TYPE_LABELS[String(row.hook_type)] ?? String(row.hook_type ?? "—")}
                        value={row.views as number}
                        maxValue={maxHookViews}
                        secondary={`Ø ${formatNum(Math.round(row.avg_views as number))} · ${row.clips} Clips`}
                      />
                    ))}
                  </div>
                  {data.byHookType.length === 0 && (
                    <p className="text-xs text-muted-foreground py-2">Noch keine Hook-Typ-Daten.</p>
                  )}
                </SectionCard>
              )}

              {/* Content angle */}
              {data.byContentAngle.length > 0 && (
                <SectionCard title="Content-Winkel Performance">
                  <div className="space-y-2.5">
                    {data.byContentAngle.map(row => (
                      <BarRow
                        key={String(row.content_angle)}
                        label={ANGLE_LABELS[String(row.content_angle)] ?? String(row.content_angle ?? "—")}
                        value={row.views as number}
                        maxValue={maxAngleViews}
                        secondary={`Ø ${formatNum(Math.round(row.avg_views as number))} · ${row.clips} Clips`}
                      />
                    ))}
                  </div>
                </SectionCard>
              )}

              {/* Clip length */}
              {data.byLengthBucket.length > 0 && (
                <SectionCard title="Clip-Länge Performance">
                  <div className="space-y-2.5">
                    {data.byLengthBucket.map(row => (
                      <BarRow
                        key={String(row.clip_length_bucket)}
                        label={LENGTH_LABELS[String(row.clip_length_bucket)] ?? String(row.clip_length_bucket ?? "—")}
                        value={row.views as number}
                        maxValue={maxLengthViews}
                        secondary={`Ø ${formatNum(Math.round(row.avg_views as number))} · ${row.clips} Clips`}
                      />
                    ))}
                  </div>
                </SectionCard>
              )}

              {/* CTA type */}
              {data.byCtaType.length > 0 && (
                <SectionCard title="CTA-Typ Performance">
                  <div className="space-y-2.5">
                    {data.byCtaType.map(row => (
                      <BarRow
                        key={String(row.cta_type)}
                        label={CTA_LABELS[String(row.cta_type)] ?? String(row.cta_type ?? "—")}
                        value={row.views as number}
                        maxValue={maxCtaViews}
                        secondary={`Ø ${formatNum(Math.round(row.avg_views as number))} · ${row.clips} Clips`}
                      />
                    ))}
                  </div>
                </SectionCard>
              )}
            </div>

            {/* Topic breakdown */}
            {data.byTopic.length > 0 && (
              <SectionCard title={`Topics (${data.byTopic.length})`}>
                <p className="text-xs text-muted-foreground -mt-1">Klicke auf ein Topic zum Filtern.</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {data.byTopic.map(row => (
                    <BarRow
                      key={String(row.topic)}
                      label={String(row.topic ?? "—")}
                      value={row.views as number}
                      maxValue={maxTopicViews}
                      secondary={`Ø ${formatNum(Math.round(row.avg_views as number))} · ${row.clips} Clips`}
                      onClick={() => drillTopic(String(row.topic))}
                      active={topic === String(row.topic)}
                    />
                  ))}
                </div>
              </SectionCard>
            )}

            {/* Top clips table */}
            {data.topClips.length > 0 && (
              <SectionCard title={`Top ${data.topClips.length} Clips`}>
                <div className="overflow-x-auto -mx-5 px-5">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border text-muted-foreground">
                        <th className="pb-2 text-center w-8">#</th>
                        <th className="pb-2 text-left">Clip</th>
                        <th className="pb-2 text-left">Plattform</th>
                        <th className="pb-2 text-left">Hook</th>
                        <th className="pb-2 text-left">Winkel</th>
                        <th className="pb-2 text-left">Länge</th>
                        <th className="pb-2 text-left">Topic</th>
                        <th className="pb-2 text-right">Views</th>
                        <th className="pb-2 text-right">Disc.%</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {data.topClips.map((clip, i) => {
                        const discCfg = DISC_LABELS[clip.discrepancy_status ?? ""] ?? null;
                        return (
                          <tr key={clip.id ?? i} className="hover:bg-muted/20">
                            <td className="py-2.5 text-center">
                              {i < 3 ? RANK_BADGES[i] : <span className="text-muted-foreground">{i + 1}</span>}
                            </td>
                            <td className="py-2.5 max-w-48">
                              <div className="flex items-center gap-1">
                                <Link
                                  href={`/ops/clips/${clip.id}`}
                                  className="truncate hover:text-primary transition-colors"
                                  title={clip.title ?? ""}
                                >
                                  {clip.title ?? "—"}
                                </Link>
                                {clip.url && (
                                  <a href={clip.url} target="_blank" rel="noopener noreferrer" className="shrink-0 opacity-40 hover:opacity-100">
                                    <ExternalLink className="h-3 w-3" />
                                  </a>
                                )}
                              </div>
                              <span className="text-muted-foreground text-xs">{clip.cutter_name}</span>
                            </td>
                            <td className="py-2.5">
                              <span className="rounded bg-muted px-1.5 py-0.5">
                                {PLATFORM_LABELS[clip.platform ?? ""] ?? clip.platform ?? "—"}
                              </span>
                            </td>
                            <td className="py-2.5 text-muted-foreground">
                              {HOOK_TYPE_LABELS[clip.hook_type ?? ""] ?? clip.hook_type ?? "—"}
                            </td>
                            <td className="py-2.5 text-muted-foreground">
                              {ANGLE_LABELS[clip.content_angle ?? ""] ?? clip.content_angle ?? "—"}
                            </td>
                            <td className="py-2.5 text-muted-foreground">
                              {LENGTH_LABELS[clip.clip_length_bucket ?? ""] ?? clip.clip_length_bucket ?? "—"}
                            </td>
                            <td className="py-2.5 text-muted-foreground max-w-24 truncate" title={clip.topic ?? ""}>
                              {clip.topic ?? "—"}
                            </td>
                            <td className="py-2.5 text-right font-mono">
                              {formatNum(clip.current_views)}
                            </td>
                            <td className="py-2.5 text-right">
                              {clip.discrepancy_percent != null ? (
                                <span className={discCfg?.cls ?? ""}>
                                  {clip.discrepancy_percent > 0 ? "+" : ""}
                                  {clip.discrepancy_percent.toFixed(1)}%
                                </span>
                              ) : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </SectionCard>
            )}

            {/* Recent episodes */}
            {data.recentEpisodes.length > 0 && (
              <SectionCard title="Top Episoden nach Views" defaultOpen={false}>
                <div className="overflow-x-auto -mx-5 px-5">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border text-muted-foreground">
                        <th className="pb-2 text-left">Episode</th>
                        <th className="pb-2 text-left">Cutter</th>
                        <th className="pb-2 text-right">Clips</th>
                        <th className="pb-2 text-right">Verifizierte Views</th>
                        <th className="pb-2 text-right">Angegebene Views</th>
                        <th className="pb-2 text-right">Erstellt</th>
                        <th className="pb-2 text-center">Detail</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {data.recentEpisodes.map((ep, i) => (
                        <tr key={ep.id ?? i} className="hover:bg-muted/20">
                          <td className="py-2.5">
                            <Link
                              href={`/ops/episodes/${ep.id}`}
                              className="font-medium hover:text-primary transition-colors"
                            >
                              {ep.title ?? "—"}
                            </Link>
                          </td>
                          <td className="py-2.5 text-muted-foreground">{ep.cutter_name ?? "—"}</td>
                          <td className="py-2.5 text-right">{ep.clip_count}</td>
                          <td className="py-2.5 text-right font-mono">{formatNum(ep.total_views)}</td>
                          <td className="py-2.5 text-right font-mono text-muted-foreground">{formatNum(ep.claimed_views)}</td>
                          <td className="py-2.5 text-right text-muted-foreground">{formatDate(ep.created_at)}</td>
                          <td className="py-2.5 text-center">
                            <Link
                              href={`/ops/episodes/${ep.id}`}
                              className="inline-flex items-center gap-0.5 text-primary hover:underline"
                            >
                              <Film className="h-3 w-3" />
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </SectionCard>
            )}

            {/* Empty state for attribute breakdowns */}
            {data.byHookType.length === 0 && data.byContentAngle.length === 0 &&
             data.byLengthBucket.length === 0 && data.byCtaType.length === 0 &&
             data.byTopic.length === 0 && (
              <div className="rounded-xl border border-border bg-card px-5 py-10 text-center">
                <BarChart2 className="h-8 w-8 mx-auto mb-3 text-muted-foreground opacity-30" />
                <p className="text-sm font-medium text-muted-foreground">Noch keine Content-Attribute vergeben</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Öffne einen Clip und setze Attribute wie Hook-Typ, Winkel und Topic, um hier Trends zu sehen.
                </p>
              </div>
            )}
          </>
        ) : null}

        <div className="h-4" />
      </main>
    </>
  );
}
