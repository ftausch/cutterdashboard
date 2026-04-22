"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CutterNav } from "@/components/cutter-nav";
import { TrendingUp, Film, Eye, Euro, ArrowRight, ExternalLink, ShieldCheck, Clock } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────
interface MonthlyPoint { month: string; label: string; earnings: number; views: number }
interface ClipRow {
  id: string; platform: string; url: string; title: string | null;
  current_views: number; views_at_last_invoice: number;
  verification_status: string | null; discrepancy_status: string | null;
  proof_url: string | null; proof_status: string | null;
  is_flagged: boolean; last_scraped_at: string | null; created_at: string;
}
interface PerfData {
  videoCount: number; totalViews: number; viewsThisMonth: number;
  avgViews: number; totalEarnings: number; unbilledViews: number;
  unbilledAmount: number; ratePerView: number;
  reliabilityScore: number | null; trustScore: number | null; performanceScore: number | null;
  topClips: ClipRow[]; platformViews: Record<string, number>;
  platformCounts: Record<string, number>; statusCounts: Record<string, number>;
  monthlyEarnings: MonthlyPoint[];
}

// ── Helpers ────────────────────────────────────────────────────────
function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  return new Intl.NumberFormat("de-DE").format(n);
}
function formatEur(n: number): string {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);
}

// ── Platform config ────────────────────────────────────────────────
const PLATFORM_LABELS: Record<string, string> = {
  youtube: "YouTube", tiktok: "TikTok", instagram: "Instagram", facebook: "Facebook",
};
const PLATFORM_BAR: Record<string, string> = {
  youtube: "bg-red-400/70", tiktok: "bg-cyan-400/70", instagram: "bg-pink-400/70", facebook: "bg-blue-400/70",
};
const PLATFORM_DOT: Record<string, string> = {
  youtube: "bg-red-400", tiktok: "bg-cyan-400", instagram: "bg-pink-400", facebook: "bg-blue-400",
};

// ── Status config ──────────────────────────────────────────────────
const STATUS_CONFIG: Record<string, { label: string; dot: string }> = {
  submitted:             { label: "Eingereicht",  dot: "bg-muted-foreground/40" },
  syncing:               { label: "Syncing",      dot: "bg-blue-400" },
  verified:              { label: "Verifiziert",  dot: "bg-emerald-400" },
  partially_verified:    { label: "Teilweise",    dot: "bg-yellow-400" },
  manual_proof_required: { label: "Beleg nötig",  dot: "bg-orange-400 animate-pulse" },
  under_review:          { label: "In Prüfung",   dot: "bg-purple-400" },
  rejected:              { label: "Abgelehnt",    dot: "bg-red-400" },
};

// ── Skeleton ───────────────────────────────────────────────────────
function Sk({ className }: { className: string }) {
  return <div className={`skeleton ${className}`} />;
}

// ── KPI Card ───────────────────────────────────────────────────────
function KpiCard({ label, value, sub, accent }: {
  label: string; value: string; sub?: string; accent?: boolean;
}) {
  return (
    <div className={`rounded-lg border p-4 ${
      accent ? "border-primary/20 bg-primary/[0.04]" : "border-border bg-card"
    }`}>
      <p className="text-xs text-muted-foreground mb-2.5">{label}</p>
      <p className={`text-2xl font-bold tabular-nums leading-none ${accent ? "text-primary" : ""}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1.5">{sub}</p>}
    </div>
  );
}

// ── Section Header ─────────────────────────────────────────────────
function SectionHeader({ title, link, linkLabel }: { title: string; link?: string; linkLabel?: string }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="text-sm font-semibold">{title}</h2>
      {link && linkLabel && (
        <Link href={link} className="flex items-center gap-1 text-xs text-muted-foreground/60 hover:text-foreground transition-colors">
          {linkLabel} <ArrowRight className="h-3 w-3" />
        </Link>
      )}
    </div>
  );
}

// ── Monthly earnings chart ─────────────────────────────────────────
function EarningsChart({ data }: { data: MonthlyPoint[] }) {
  const max = Math.max(...data.map((d) => d.earnings), 1);
  const hasAny = data.some((d) => d.earnings > 0);
  return (
    <div className="flex items-end gap-2 h-32">
      {data.map((point) => {
        const pct = (point.earnings / max) * 100;
        return (
          <div key={point.month} className="flex-1 flex flex-col items-center gap-1.5 group">
            <div className="relative w-full flex items-end justify-center h-24">
              {point.earnings > 0 ? (
                <div
                  className="w-full rounded-t bg-primary/50 group-hover:bg-primary/70 transition-colors cursor-default"
                  style={{ height: `${Math.max(pct, 3)}%` }}
                  title={formatEur(point.earnings)}
                />
              ) : (
                <div className="w-full rounded-t bg-muted/20" style={{ height: "3%" }} />
              )}
            </div>
            <span className="text-[10px] text-muted-foreground/50">{point.label}</span>
          </div>
        );
      })}
      {!hasAny && (
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="text-xs text-muted-foreground">Noch keine Rechnungen in den letzten 6 Monaten</p>
        </div>
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────
export default function PerformancePage() {
  const router  = useRouter();
  const [data,    setData]    = useState<PerfData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/performance")
      .then((r) => { if (r.status === 401 || r.status === 403) { router.push("/login"); return null; } return r.json(); })
      .then((d) => { if (d) setData(d); })
      .finally(() => setLoading(false));
  }, [router]);

  const platformEntries = Object.entries(data?.platformViews ?? {}).sort((a, b) => b[1] - a[1]);
  const totalAllViews   = platformEntries.reduce((s, [, v]) => s + v, 0);

  return (
    <>
      <CutterNav />
      <main className="mx-auto max-w-6xl px-6 py-8 space-y-7">

        {/* ── Page header ─────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Performance</h1>
            <p className="mt-1 text-sm text-muted-foreground">Views, Verdienste und Clip-Analyse</p>
          </div>
          {data && (
            <span className="text-xs text-muted-foreground hidden sm:block mt-1 tabular-nums">
              {data.ratePerView.toLocaleString("de-DE", { style: "currency", currency: "EUR", minimumFractionDigits: 4 })} / View
            </span>
          )}
        </div>

        {/* ── Views KPIs ──────────────────────────────────────── */}
        <section>
          <SectionHeader title="Views" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {loading ? (
              [...Array(4)].map((_, i) => (
                <div key={i} className="rounded-lg border border-border bg-card p-4">
                  <Sk className="h-3 w-20 mb-3" /><Sk className="h-7 w-16" />
                </div>
              ))
            ) : (
              <>
                <KpiCard label="Clips gesamt"   value={String(data?.videoCount ?? 0)}  sub="eingereichte Videos" />
                <KpiCard label="Views gesamt"   value={formatNum(data?.totalViews ?? 0)} sub="alle Plattformen" />
                <KpiCard label="Dieser Monat"   value={formatNum(data?.viewsThisMonth ?? 0)} sub="neue Views" />
                <KpiCard label="Ø pro Clip"     value={formatNum(data?.avgViews ?? 0)} sub="Durchschnitt" />
              </>
            )}
          </div>
        </section>

        {/* ── Earnings KPIs ───────────────────────────────────── */}
        <section>
          <SectionHeader title="Verdienst" link="/invoices" linkLabel="Rechnungen" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {loading ? (
              [...Array(4)].map((_, i) => (
                <div key={i} className="rounded-lg border border-border bg-card p-4">
                  <Sk className="h-3 w-20 mb-3" /><Sk className="h-7 w-20" />
                </div>
              ))
            ) : (
              <>
                <KpiCard label="Gesamtverdienst" value={formatEur(data?.totalEarnings ?? 0)} sub="aus Rechnungen" />
                <KpiCard
                  label="Nicht abgerechnet"
                  value={formatEur(data?.unbilledAmount ?? 0)}
                  sub={`${formatNum(data?.unbilledViews ?? 0)} Views offen`}
                  accent={(data?.unbilledViews ?? 0) > 0}
                />
                <KpiCard
                  label="Zuverlässigkeit"
                  value={data?.reliabilityScore != null ? `${data.reliabilityScore}/100` : "—"}
                  sub={
                    data?.reliabilityScore != null
                      ? data.reliabilityScore >= 85 ? "Ausgezeichnet"
                      : data.reliabilityScore >= 70 ? "Stark"
                      : data.reliabilityScore >= 50 ? "Durchschnitt" : "Verbesserungsbedarf"
                      : "Noch kein Score"
                  }
                />
                <KpiCard
                  label="Rate"
                  value={data?.ratePerView ? data.ratePerView.toLocaleString("de-DE", { style: "currency", currency: "EUR", minimumFractionDigits: 4 }) : "—"}
                  sub="pro View"
                />
              </>
            )}
          </div>
        </section>

        {/* ── Chart + Platform breakdown ───────────────────────── */}
        <div className="grid gap-5 sm:grid-cols-2">

          {/* Monthly earnings chart */}
          <section>
            <SectionHeader title="Verdienst letzte 6 Monate" />
            <div className="rounded-lg border border-border bg-card p-5">
              {loading ? (
                <div className="flex items-end gap-2 h-32">
                  {[40, 70, 30, 80, 55, 65].map((h, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
                      <div className="w-full flex items-end h-24">
                        <div className="skeleton w-full rounded-t" style={{ height: `${h}%` }} />
                      </div>
                      <Sk className="h-2 w-5" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="relative">
                  <EarningsChart data={data?.monthlyEarnings ?? []} />
                </div>
              )}
            </div>
          </section>

          {/* Platform breakdown */}
          <section>
            <SectionHeader title="Views nach Plattform" />
            <div className="rounded-lg border border-border bg-card p-5 space-y-4">
              {loading ? (
                [...Array(3)].map((_, i) => (
                  <div key={i} className="space-y-1.5">
                    <div className="flex justify-between"><Sk className="h-3 w-20" /><Sk className="h-3 w-14" /></div>
                    <Sk className="h-1 w-full rounded-full" />
                  </div>
                ))
              ) : platformEntries.length === 0 ? (
                <div className="flex flex-col items-center py-8 gap-2 text-center">
                  <Eye className="h-6 w-6 text-muted-foreground/15" />
                  <p className="text-xs text-muted-foreground">Noch keine Views</p>
                </div>
              ) : (
                platformEntries.map(([platform, views]) => {
                  const pct = totalAllViews > 0 ? (views / totalAllViews) * 100 : 0;
                  const count = data?.platformCounts?.[platform] ?? 0;
                  return (
                    <div key={platform}>
                      <div className="mb-1.5 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={`h-1.5 w-1.5 rounded-full ${PLATFORM_DOT[platform] ?? "bg-muted"}`} />
                          <span className="text-sm font-medium">{PLATFORM_LABELS[platform] ?? platform}</span>
                        </div>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {formatNum(views)} · {count} Clips
                        </span>
                      </div>
                      <div className="h-1 w-full overflow-hidden rounded-full bg-muted/30">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${PLATFORM_BAR[platform] ?? "bg-primary/50"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>

        </div>

        {/* ── Top Clips ────────────────────────────────────────── */}
        <section>
          <SectionHeader title="Top Clips nach Views" link="/videos" linkLabel="Alle Videos" />

          {loading ? (
            <div className="rounded-lg border border-border bg-card overflow-hidden">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center gap-4 border-b border-border px-5 py-3.5 last:border-0">
                  <Sk className="h-7 w-7 rounded shrink-0" />
                  <div className="flex-1"><Sk className="h-3.5 w-48 mb-2" /><Sk className="h-3 w-24" /></div>
                  <Sk className="h-5 w-16" />
                </div>
              ))}
            </div>
          ) : !data?.topClips.length ? (
            <div className="rounded-lg border border-border bg-card flex flex-col items-center py-16 text-center gap-2">
              <Film className="h-8 w-8 text-muted-foreground/15 mb-1" />
              <p className="text-sm font-medium">Noch keine Videos eingereicht</p>
              <p className="text-xs text-muted-foreground">Reiche dein erstes Video ein um zu starten.</p>
            </div>
          ) : (
            <div className="rounded-lg border border-border bg-card overflow-hidden">
              {data.topClips.map((v, idx) => {
                let status = "submitted";
                if (v.is_flagged) status = "rejected";
                else if (v.proof_status === "submitted") status = "under_review";
                else if (v.discrepancy_status === "critical_difference" || v.discrepancy_status === "suspicious_difference") {
                  status = v.proof_url ? "under_review" : "manual_proof_required";
                } else if (v.verification_status === "verified") status = "verified";
                else if (v.verification_status === "partially_verified") status = "partially_verified";
                else if (v.last_scraped_at) status = "syncing";

                const sCfg   = STATUS_CONFIG[status] ?? STATUS_CONFIG.submitted;
                const unbilled = v.current_views - v.views_at_last_invoice;

                return (
                  <div key={v.id} className="flex items-center gap-4 border-b border-border px-5 py-3.5 last:border-0 hover:bg-accent/20 transition-colors">
                    {/* Rank */}
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-xs font-bold text-muted-foreground/40 tabular-nums">
                      {idx + 1}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-sm">{v.title || "Ohne Titel"}</p>
                      <div className="mt-0.5 flex items-center gap-2">
                        <span className={`h-1.5 w-1.5 rounded-full ${PLATFORM_DOT[v.platform] ?? "bg-muted"}`} />
                        <span className="text-xs text-muted-foreground">{PLATFORM_LABELS[v.platform] ?? v.platform}</span>
                        <span className="text-muted-foreground/30 text-xs">·</span>
                        <span className={`h-1.5 w-1.5 rounded-full ${sCfg.dot}`} />
                        <span className="text-xs text-muted-foreground">{sCfg.label}</span>
                        {unbilled > 0 && (
                          <span className="text-xs text-primary font-medium">+{formatNum(unbilled)} offen</span>
                        )}
                      </div>
                    </div>

                    {/* Views */}
                    <div className="text-right shrink-0">
                      <p className="text-base font-bold tabular-nums leading-none">{formatNum(v.current_views)}</p>
                      <p className="text-xs text-muted-foreground/50 mt-0.5">Views</p>
                    </div>

                    {/* External link */}
                    <a
                      href={v.url} target="_blank" rel="noopener noreferrer"
                      className="shrink-0 rounded-md p-1.5 text-muted-foreground/30 hover:text-muted-foreground hover:bg-accent transition-colors"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ── Status + Reliability row ─────────────────────────── */}
        <div className="grid gap-5 sm:grid-cols-2">

          {/* Clip status */}
          <section>
            <SectionHeader title="Clip-Status" />
            <div className="rounded-lg border border-border bg-card p-5">
              {loading ? (
                <div className="flex flex-wrap gap-2">
                  {[...Array(4)].map((_, i) => <Sk key={i} className="h-6 w-24 rounded-full" />)}
                </div>
              ) : !data?.topClips.length ? (
                <div className="flex flex-col items-center py-6 gap-1.5 text-center">
                  <Film className="h-6 w-6 text-muted-foreground/15" />
                  <p className="text-xs text-muted-foreground">Keine Clips</p>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {Object.entries(STATUS_CONFIG).map(([key, cfg]) => {
                    const count = data?.statusCounts?.[key];
                    if (!count) return null;
                    return (
                      <span key={key} className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/20 px-2.5 py-1 text-xs">
                        <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
                        <span className="text-muted-foreground">{cfg.label}</span>
                        <span className="font-semibold text-foreground">{count}</span>
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          </section>

          {/* Reliability */}
          <section>
            <SectionHeader title="Zuverlässigkeit" />
            <div className="rounded-lg border border-border bg-card p-5">
              {loading ? (
                <div className="space-y-3">
                  {[...Array(3)].map((_, i) => (
                    <div key={i}>
                      <div className="flex justify-between mb-1.5"><Sk className="h-3 w-20" /><Sk className="h-3 w-8" /></div>
                      <Sk className="h-1 w-full rounded-full" />
                    </div>
                  ))}
                </div>
              ) : data?.reliabilityScore == null ? (
                <div className="flex flex-col items-center py-6 gap-2 text-center">
                  <Clock className="h-6 w-6 text-muted-foreground/15" />
                  <p className="text-xs text-muted-foreground">Score wird nach erster Verifikation berechnet</p>
                </div>
              ) : (
                <div className="space-y-3.5">
                  {[
                    { label: "Gesamt",      value: data.reliabilityScore,      color: "bg-primary/80" },
                    { label: "Trust",       value: data.trustScore ?? 0,       color: "bg-emerald-500/70" },
                    { label: "Performance", value: data.performanceScore ?? 0, color: "bg-blue-500/70" },
                  ].map(({ label, value, color }) => (
                    <div key={label}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs text-muted-foreground">{label}</span>
                        <span className="text-xs font-semibold tabular-nums">{value}/100</span>
                      </div>
                      <div className="h-1 w-full overflow-hidden rounded-full bg-muted/30">
                        <div className={`h-full rounded-full transition-all duration-700 ${color}`} style={{ width: `${value}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

        </div>

      </main>
    </>
  );
}
