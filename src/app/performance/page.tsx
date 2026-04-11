"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CutterNav } from "@/components/cutter-nav";
import {
  TrendingUp, Film, Eye, Euro, ArrowRight,
  ExternalLink, ShieldCheck, Clock,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────
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

// ── Helpers ────────────────────────────────────────────────────
function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return new Intl.NumberFormat("de-DE").format(n);
}
function formatEur(n: number): string {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);
}

// ── Platform config ────────────────────────────────────────────
const PLATFORM_LABELS: Record<string, string> = {
  youtube: "YouTube", tiktok: "TikTok", instagram: "Instagram", facebook: "Facebook",
};
const PLATFORM_BAR: Record<string, string> = {
  youtube: "bg-red-400", tiktok: "bg-cyan-400", instagram: "bg-pink-400", facebook: "bg-blue-400",
};
const PLATFORM_BADGE: Record<string, string> = {
  youtube:   "bg-red-500/10 text-red-400 border-red-500/20",
  tiktok:    "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
  instagram: "bg-pink-500/10 text-pink-400 border-pink-500/20",
  facebook:  "bg-blue-500/10 text-blue-400 border-blue-500/20",
};

// ── Status config ──────────────────────────────────────────────
const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  submitted:             { label: "Eingereicht",   cls: "bg-muted/50 text-muted-foreground border-border" },
  syncing:               { label: "Syncing",        cls: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
  verified:              { label: "Verifiziert",    cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
  partially_verified:    { label: "Teilweise",      cls: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20" },
  manual_proof_required: { label: "Beleg nötig",   cls: "bg-orange-500/10 text-orange-400 border-orange-500/20" },
  under_review:          { label: "In Prüfung",     cls: "bg-purple-500/10 text-purple-400 border-purple-500/20" },
  rejected:              { label: "Abgelehnt",      cls: "bg-red-500/10 text-red-400 border-red-500/20" },
};

// ── Skeleton ───────────────────────────────────────────────────
function Skeleton({ className }: { className: string }) {
  return <div className={`skeleton ${className}`} />;
}

// ── KPI Card ───────────────────────────────────────────────────
function KpiCard({ label, value, sub, accent }: {
  label: string; value: string; sub?: string; accent?: boolean;
}) {
  return (
    <div className={`rounded-xl border p-4 ${accent ? "border-primary/30 bg-primary/5" : "border-border bg-card"}`}>
      <p className="text-xs text-muted-foreground mb-1.5">{label}</p>
      <p className={`text-2xl font-bold tabular-nums leading-none ${accent ? "text-primary" : ""}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
}

// ── Monthly earnings chart (CSS bars) ─────────────────────────
function EarningsChart({ data }: { data: MonthlyPoint[] }) {
  const max = Math.max(...data.map((d) => d.earnings), 1);
  const hasAny = data.some((d) => d.earnings > 0);

  return (
    <div>
      <div className="flex items-end gap-2 h-28">
        {data.map((point) => {
          const pct = (point.earnings / max) * 100;
          return (
            <div key={point.month} className="flex-1 flex flex-col items-center gap-1 group">
              <div className="relative w-full flex items-end justify-center h-20">
                {point.earnings > 0 ? (
                  <div
                    className="w-full rounded-t-md bg-primary/70 group-hover:bg-primary transition-colors"
                    style={{ height: `${Math.max(pct, 4)}%` }}
                    title={formatEur(point.earnings)}
                  />
                ) : (
                  <div className="w-full rounded-t-md bg-muted/30" style={{ height: "4%" }} />
                )}
              </div>
              <span className="text-[10px] text-muted-foreground">{point.label}</span>
            </div>
          );
        })}
      </div>
      {!hasAny && (
        <p className="text-xs text-muted-foreground text-center mt-2">
          Noch keine Rechnungen in den letzten 6 Monaten
        </p>
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────
export default function PerformancePage() {
  const router  = useRouter();
  const [data,    setData]    = useState<PerfData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/performance")
      .then((r) => {
        if (r.status === 401 || r.status === 403) { router.push("/login"); return null; }
        return r.json();
      })
      .then((d) => { if (d) setData(d); })
      .finally(() => setLoading(false));
  }, [router]);

  const platformEntries = Object.entries(data?.platformViews ?? {}).sort((a, b) => b[1] - a[1]);
  const totalAllViews   = platformEntries.reduce((s, [, v]) => s + v, 0);

  return (
    <>
      <CutterNav />
      <main className="mx-auto max-w-5xl p-6 space-y-6">

        {/* ── Header ─────────────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Performance</h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Deine Views, Verdienste und Clip-Übersicht auf einen Blick
            </p>
          </div>
          {data && (
            <p className="text-xs text-muted-foreground hidden sm:block">
              {data.ratePerView.toLocaleString("de-DE", { style: "currency", currency: "EUR", minimumFractionDigits: 4 })} pro View
            </p>
          )}
        </div>

        {/* ── KPI row 1: Views ───────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {loading ? (
            [...Array(4)].map((_, i) => (
              <div key={i} className="rounded-xl border border-border bg-card p-4">
                <Skeleton className="h-3 w-20 mb-2" />
                <Skeleton className="h-7 w-16" />
              </div>
            ))
          ) : (
            <>
              <KpiCard label="Clips gesamt"      value={String(data?.videoCount ?? 0)} sub="eingereichte Videos" />
              <KpiCard label="Views gesamt"       value={formatNum(data?.totalViews ?? 0)} sub="alle Plattformen" />
              <KpiCard label="Dieser Monat"       value={formatNum(data?.viewsThisMonth ?? 0)} sub="neue Views" />
              <KpiCard label="Ø pro Clip"         value={formatNum(data?.avgViews ?? 0)} sub="Durchschnitt" />
            </>
          )}
        </div>

        {/* ── KPI row 2: Earnings ─────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {loading ? (
            [...Array(4)].map((_, i) => (
              <div key={i} className="rounded-xl border border-border bg-card p-4">
                <Skeleton className="h-3 w-20 mb-2" />
                <Skeleton className="h-7 w-20" />
              </div>
            ))
          ) : (
            <>
              <KpiCard
                label="Gesamtverdienst"
                value={formatEur(data?.totalEarnings ?? 0)}
                sub="aus allen Rechnungen"
              />
              <KpiCard
                label="Nicht abgerechnet"
                value={formatEur(data?.unbilledAmount ?? 0)}
                sub={`${formatNum(data?.unbilledViews ?? 0)} Views offen`}
                accent={(data?.unbilledViews ?? 0) > 0}
              />
              <KpiCard
                label="Zuverlässigkeit"
                value={data?.reliabilityScore != null ? `${data.reliabilityScore}/100` : "—"}
                sub={data?.reliabilityScore != null
                  ? data.reliabilityScore >= 85 ? "Ausgezeichnet"
                  : data.reliabilityScore >= 70 ? "Stark"
                  : data.reliabilityScore >= 50 ? "Durchschnitt" : "Verbesserungsbedarf"
                  : "Noch kein Score"}
              />
              <KpiCard
                label="Rate"
                value={data?.ratePerView
                  ? data.ratePerView.toLocaleString("de-DE", { style: "currency", currency: "EUR", minimumFractionDigits: 4 })
                  : "—"}
                sub="pro View"
              />
            </>
          )}
        </div>

        {/* ── Earnings chart + Platform breakdown ─────────────── */}
        <div className="grid gap-4 sm:grid-cols-2">

          {/* Monthly earnings */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <Euro className="h-4 w-4 text-primary" />
                Verdienst letzte 6 Monate
              </h2>
              <Link href="/invoices" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                Rechnungen <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              {loading ? (
                <div className="flex items-end gap-2 h-28">
                  {[40, 70, 30, 80, 55, 65].map((h, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1">
                      <div className="w-full flex items-end h-20">
                        <div className="skeleton w-full rounded-t-md" style={{ height: `${h}%` }} />
                      </div>
                      <Skeleton className="h-2 w-6" />
                    </div>
                  ))}
                </div>
              ) : (
                <EarningsChart data={data?.monthlyEarnings ?? []} />
              )}
            </div>
          </section>

          {/* Platform breakdown */}
          <section>
            <h2 className="flex items-center gap-2 text-sm font-semibold mb-3">
              <Eye className="h-4 w-4 text-primary" />
              Views nach Plattform
            </h2>
            <div className="rounded-xl border border-border bg-card p-4 space-y-3">
              {loading ? (
                [...Array(3)].map((_, i) => (
                  <div key={i} className="space-y-1.5">
                    <div className="flex justify-between">
                      <Skeleton className="h-3 w-20" />
                      <Skeleton className="h-3 w-14" />
                    </div>
                    <Skeleton className="h-1.5 w-full rounded-full" />
                  </div>
                ))
              ) : platformEntries.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Noch keine Views</p>
              ) : (
                platformEntries.map(([platform, views]) => {
                  const pct = totalAllViews > 0 ? (views / totalAllViews) * 100 : 0;
                  const count = data?.platformCounts?.[platform] ?? 0;
                  return (
                    <div key={platform}>
                      <div className="mb-1.5 flex items-center justify-between text-sm">
                        <span className="font-medium">{PLATFORM_LABELS[platform] ?? platform}</span>
                        <span className="tabular-nums text-muted-foreground text-xs">
                          {formatNum(views)} Views · {count} Clips
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/40">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${PLATFORM_BAR[platform] ?? "bg-primary"}`}
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

        {/* ── Top 10 Clips ────────────────────────────────────── */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <TrendingUp className="h-4 w-4 text-primary" />
              Top Clips nach Views
            </h2>
            <Link href="/videos" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
              Alle Videos <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          {loading ? (
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-0">
                  <Skeleton className="h-9 w-9 rounded-lg shrink-0" />
                  <div className="flex-1">
                    <Skeleton className="h-3.5 w-48 mb-1.5" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                  <Skeleton className="h-5 w-16" />
                </div>
              ))}
            </div>
          ) : !data?.topClips.length ? (
            <div className="rounded-xl border border-border bg-card flex flex-col items-center py-14 text-center">
              <Film className="mb-3 h-10 w-10 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground mb-3">Noch keine Videos eingereicht</p>
              <Link
                href="/videos/submit"
                className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground"
              >
                Erstes Video einreichen <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              {data.topClips.map((v, idx) => {
                // Status
                let status = "submitted";
                if (v.is_flagged) status = "rejected";
                else if (v.proof_status === "submitted") status = "under_review";
                else if (v.discrepancy_status === "critical_difference" || v.discrepancy_status === "suspicious_difference") {
                  status = v.proof_url ? "under_review" : "manual_proof_required";
                } else if (v.verification_status === "verified") status = "verified";
                else if (v.verification_status === "partially_verified") status = "partially_verified";
                else if (v.last_scraped_at) status = "syncing";

                const sCfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.submitted;
                const pBadge = PLATFORM_BADGE[v.platform] ?? "bg-muted/50 text-muted-foreground border-border";
                const unbilled = v.current_views - v.views_at_last_invoice;

                return (
                  <div
                    key={v.id}
                    className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-0 hover:bg-accent/20 transition-colors"
                  >
                    {/* Rank */}
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted/50 text-xs font-bold text-muted-foreground">
                      {idx + 1}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-sm font-medium">{v.title || "Ohne Titel"}</p>
                      <div className="mt-0.5 flex items-center gap-1.5 flex-wrap">
                        <span className={`rounded px-1.5 py-0.5 text-xs font-medium border ${pBadge}`}>
                          {PLATFORM_LABELS[v.platform] ?? v.platform}
                        </span>
                        <span className={`rounded px-1.5 py-0.5 text-xs font-medium border ${sCfg.cls}`}>
                          {sCfg.label}
                        </span>
                        {unbilled > 0 && (
                          <span className="text-xs text-primary font-medium">
                            +{formatNum(unbilled)} offen
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Views */}
                    <div className="text-right shrink-0">
                      <p className="text-base font-bold tabular-nums leading-none">{formatNum(v.current_views)}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Views</p>
                    </div>

                    {/* External link */}
                    <a
                      href={v.url} target="_blank" rel="noopener noreferrer"
                      className="shrink-0 rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
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
        <div className="grid gap-4 sm:grid-cols-2">

          {/* Clip status overview */}
          <section>
            <h2 className="flex items-center gap-2 text-sm font-semibold mb-3">
              <Film className="h-4 w-4 text-primary" />
              Clip-Status
            </h2>
            <div className="rounded-xl border border-border bg-card p-4">
              {loading ? (
                <div className="flex flex-wrap gap-2">
                  {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-7 w-24 rounded-full" />)}
                </div>
              ) : !data?.topClips.length ? (
                <p className="text-sm text-muted-foreground text-center py-4">Keine Clips</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {Object.entries(STATUS_CONFIG).map(([key, cfg]) => {
                    const count = data?.statusCounts?.[key];
                    if (!count) return null;
                    return (
                      <span key={key} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${cfg.cls}`}>
                        {cfg.label} <span className="font-bold">{count}</span>
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          </section>

          {/* Reliability breakdown */}
          <section>
            <h2 className="flex items-center gap-2 text-sm font-semibold mb-3">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Zuverlässigkeit
            </h2>
            <div className="rounded-xl border border-border bg-card p-4">
              {loading ? (
                <div className="space-y-3">
                  {[...Array(3)].map((_, i) => (
                    <div key={i}>
                      <div className="flex justify-between mb-1">
                        <Skeleton className="h-3 w-20" />
                        <Skeleton className="h-3 w-8" />
                      </div>
                      <Skeleton className="h-1.5 w-full rounded-full" />
                    </div>
                  ))}
                </div>
              ) : data?.reliabilityScore == null ? (
                <div className="flex flex-col items-center py-4 text-center">
                  <Clock className="h-8 w-8 text-muted-foreground/30 mb-2" />
                  <p className="text-xs text-muted-foreground">Score wird berechnet sobald erste Videos verifiziert sind</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {[
                    { label: "Gesamt",      value: data.reliabilityScore,  color: "bg-primary" },
                    { label: "Trust",       value: data.trustScore ?? 0,   color: "bg-emerald-500" },
                    { label: "Performance", value: data.performanceScore ?? 0, color: "bg-blue-500" },
                  ].map(({ label, value, color }) => (
                    <div key={label}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-muted-foreground">{label}</span>
                        <span className="text-xs font-bold tabular-nums">{value}/100</span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/40">
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
