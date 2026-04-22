"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CutterNav } from "@/components/cutter-nav";
import {
  Eye, Video, Euro, TrendingUp, Clock, Plus, Receipt,
  CheckCircle, User, Link2, Upload, ArrowRight,
  Sparkles, ChevronRight, ShieldCheck, RefreshCw,
} from "lucide-react";

interface Onboarding {
  profileComplete: boolean;
  hasAccounts: boolean;
  hasVideos: boolean;
}

interface Stats {
  videoCount: number;
  totalViews: number;
  totalEarnings: number;
  earnings30d: number;
  unbilledViews: number;
  unbilledAmount: number;
  ratePerView: number;
  reliabilityScore?: number;
  trustScore?: number;
  performanceScore?: number;
  onboarding: Onboarding;
  name?: string;
}

interface VideoRow {
  id: string;
  platform: string;
  url: string;
  title: string | null;
  current_views: number;
  unbilled_views: number;
  created_at: string;
}

const PLATFORM_LABELS: Record<string, string> = {
  youtube: "YouTube", tiktok: "TikTok", instagram: "Instagram", facebook: "Facebook",
};
const PLATFORM_DOT: Record<string, string> = {
  youtube: "bg-red-400", tiktok: "bg-cyan-400", instagram: "bg-pink-400", facebook: "bg-blue-400",
};

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  return new Intl.NumberFormat("de-DE").format(n);
}

function formatEur(n: number): string {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Guten Morgen";
  if (h < 18) return "Guten Tag";
  return "Guten Abend";
}

// ── Skeleton ──────────────────────────────────────────────────────
function DashboardSkeleton() {
  return (
    <>
      <CutterNav />
      <main className="mx-auto max-w-6xl px-6 py-8 space-y-6">
        <div>
          <div className="skeleton h-6 w-56 mb-2" />
          <div className="skeleton h-3.5 w-36" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="rounded-lg border border-border bg-card p-4">
              <div className="skeleton h-3 w-20 mb-3" />
              <div className="skeleton h-6 w-14" />
            </div>
          ))}
        </div>
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="border-b border-border px-5 py-3.5">
            <div className="skeleton h-4 w-28" />
          </div>
          {[...Array(4)].map((_, i) => (
            <div key={i} className="flex items-center justify-between px-5 py-3.5 border-b border-border last:border-0">
              <div>
                <div className="skeleton h-3.5 w-48 mb-2" />
                <div className="skeleton h-3 w-20" />
              </div>
              <div className="skeleton h-4 w-16" />
            </div>
          ))}
        </div>
      </main>
    </>
  );
}

// ── Onboarding ────────────────────────────────────────────────────
function OnboardingCard({ onboarding }: { onboarding: Onboarding }) {
  const steps = [
    {
      done: onboarding.profileComplete, num: 1, icon: <User className="h-3.5 w-3.5" />,
      title: "Profil vervollständigen", description: "Firma, Adresse, Steuernummer und IBAN eintragen", href: "/profile",
    },
    {
      done: onboarding.hasAccounts, num: 2, icon: <Link2 className="h-3.5 w-3.5" />,
      title: "Social-Media-Konto verknüpfen", description: "Mindestens ein Konto verbinden", href: "/accounts",
    },
    {
      done: onboarding.hasVideos, num: 3, icon: <Upload className="h-3.5 w-3.5" />,
      title: "Erstes Video einreichen", description: "Video-URL einreichen, damit Views getrackt werden", href: "/videos/submit",
    },
  ];
  const completed = steps.filter((s) => s.done).length;
  const pct = Math.round((completed / steps.length) * 100);

  return (
    <div className="rounded-lg border border-primary/20 bg-primary/[0.04] p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          <span className="text-sm font-semibold">Einrichtung</span>
          <span className="text-xs text-muted-foreground">{completed} von {steps.length} erledigt</span>
        </div>
        <span className="text-sm font-bold text-primary tabular-nums">{pct}%</span>
      </div>
      <div className="mb-4 h-1 w-full rounded-full bg-primary/10 overflow-hidden">
        <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>
      <div className="space-y-1.5">
        {steps.map((step) => (
          <Link
            key={step.num}
            href={step.href}
            className={`flex items-center gap-3 rounded-md border p-3 transition-all duration-150 ${
              step.done
                ? "border-border/40 opacity-50"
                : "border-border/60 hover:border-primary/25 hover:bg-accent/30"
            }`}
          >
            <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
              step.done ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
            }`}>
              {step.done ? <CheckCircle className="h-3 w-3" /> : step.num}
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-sm ${step.done ? "line-through text-muted-foreground" : "font-medium"}`}>{step.title}</p>
              {!step.done && <p className="text-xs text-muted-foreground mt-0.5">{step.description}</p>}
            </div>
            {!step.done && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />}
          </Link>
        ))}
      </div>
    </div>
  );
}

// ── Reliability Widget ────────────────────────────────────────────
type ScoreLabel = "excellent" | "strong" | "average" | "risky" | "critical";
const SCORE_META: Record<ScoreLabel, { de: string; color: string; barColor: string; border: string; bg: string }> = {
  excellent: { de: "Ausgezeichnet", color: "text-emerald-400", barColor: "bg-emerald-500", border: "border-emerald-500/25", bg: "bg-emerald-500/[0.06]" },
  strong:    { de: "Stark",         color: "text-green-400",   barColor: "bg-green-500",   border: "border-green-500/25",   bg: "bg-green-500/[0.06]"   },
  average:   { de: "Durchschnitt",  color: "text-yellow-400",  barColor: "bg-yellow-500",  border: "border-yellow-500/25",  bg: "bg-yellow-500/[0.06]"  },
  risky:     { de: "Riskant",       color: "text-orange-400",  barColor: "bg-orange-500",  border: "border-orange-500/25",  bg: "bg-orange-500/[0.06]"  },
  critical:  { de: "Kritisch",      color: "text-red-400",     barColor: "bg-red-500",     border: "border-red-500/25",     bg: "bg-red-500/[0.06]"     },
};
function getScoreLabel(s: number): ScoreLabel {
  if (s >= 85) return "excellent"; if (s >= 70) return "strong";
  if (s >= 50) return "average";   if (s >= 30) return "risky"; return "critical";
}

function ReliabilityWidget({ score, trustScore, performanceScore }: {
  score: number; trustScore: number; performanceScore: number;
}) {
  const label = getScoreLabel(score);
  const m = SCORE_META[label];
  return (
    <div className={`h-full rounded-lg border ${m.border} ${m.bg} p-4 flex flex-col`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-1.5">
          <ShieldCheck className={`h-3.5 w-3.5 ${m.color}`} />
          <span className="text-xs font-medium text-muted-foreground">Zuverlässigkeit</span>
        </div>
        <span className={`text-xs font-semibold ${m.color}`}>{m.de}</span>
      </div>
      <div className="flex items-baseline gap-1.5 mb-3">
        <span className={`text-3xl font-black tabular-nums leading-none ${m.color}`}>{score}</span>
        <span className="text-sm text-muted-foreground">/100</span>
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-muted/30 mb-4">
        <div className={`h-full rounded-full transition-all ${m.barColor}`} style={{ width: `${score}%` }} />
      </div>
      <div className="mt-auto flex items-center gap-4 border-t border-border/40 pt-3">
        <div className="flex-1">
          <p className={`text-base font-bold tabular-nums ${m.color}`}>{trustScore}</p>
          <p className="text-xs text-muted-foreground">Trust <span className="opacity-40">70%</span></p>
        </div>
        <div className="w-px h-7 bg-border/40" />
        <div className="flex-1">
          <p className={`text-base font-bold tabular-nums ${m.color}`}>{performanceScore}</p>
          <p className="text-xs text-muted-foreground">Performance <span className="opacity-40">30%</span></p>
        </div>
      </div>
    </div>
  );
}

// ── KPI Card ──────────────────────────────────────────────────────
function KpiCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-1.5 mb-2.5">
        <span className="text-muted-foreground/40">{icon}</span>
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p className="text-xl font-bold tabular-nums leading-none">{value}</p>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────
export default function CutterDashboard() {
  const router = useRouter();
  const [stats,       setStats]       = useState<Stats | null>(null);
  const [videos,      setVideos]      = useState<VideoRow[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [sessionName, setSessionName] = useState<string>("");
  const [syncing,     setSyncing]     = useState(false);
  const [syncMsg,     setSyncMsg]     = useState<string | null>(null);

  async function loadData() {
    const [statsRes, videosRes] = await Promise.all([
      fetch("/api/stats"), fetch("/api/videos"),
    ]);
    if (statsRes.status === 401) { router.push("/login"); return; }
    const statsData  = await statsRes.json();
    const videosData = await videosRes.json();
    if (statsData)           setStats(statsData);
    if (videosData?.videos)  setVideos(videosData.videos.slice(0, 6));
  }

  async function handleSync() {
    setSyncing(true); setSyncMsg(null);
    try {
      const res  = await fetch("/api/sync/views", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setSyncMsg(`${data.updated} von ${data.total} Videos aktualisiert`);
        await loadData();
      } else if (res.status === 429) {
        setSyncMsg(data.error || "Bitte warte kurz bis zum nächsten Sync.");
      } else {
        setSyncMsg(data.error || "Sync fehlgeschlagen");
      }
    } catch { setSyncMsg("Sync fehlgeschlagen"); }
    finally  { setSyncing(false); }
  }

  useEffect(() => {
    fetch("/api/auth/session").then((r) => r.ok ? r.json() : null).then((d) => d?.name && setSessionName(d.name.split(" ")[0]));
    Promise.all([
      fetch("/api/stats").then((r) => { if (r.status === 401) { router.push("/login"); return null; } return r.json(); }),
      fetch("/api/videos").then((r) => r.json()),
    ]).then(([statsData, videosData]) => {
      if (statsData)           setStats(statsData);
      if (videosData?.videos)  setVideos(videosData.videos.slice(0, 6));
      setLoading(false);
    });
  }, [router]);

  if (loading) return <DashboardSkeleton />;

  const onboardingDone = stats?.onboarding.profileComplete && stats?.onboarding.hasAccounts && stats?.onboarding.hasVideos;

  return (
    <>
      <CutterNav />
      <main className="mx-auto max-w-6xl px-6 py-8 space-y-6">

        {/* ── Page header ─────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              {getGreeting()}{sessionName ? `, ${sessionName}` : ""}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {new Date().toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" })}
              {syncMsg && (
                <span className={`ml-2 ${syncMsg.includes("fehlgeschlagen") || syncMsg.includes("warte") ? "text-red-400" : "text-primary"}`}>
                  · {syncMsg}
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleSync}
              disabled={syncing}
              className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-40"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
              <span className="hidden sm:block">{syncing ? "Sync…" : "Sync"}</span>
            </button>
            <Link
              href="/invoices"
              className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <Receipt className="h-3.5 w-3.5" />
              <span className="hidden sm:block">Rechnungen</span>
            </Link>
            <Link
              href="/videos/submit"
              className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 transition-opacity"
            >
              <Plus className="h-3.5 w-3.5" />
              <span className="hidden sm:block">Video einreichen</span>
              <span className="sm:hidden">Neu</span>
            </Link>
          </div>
        </div>

        {/* ── Onboarding ──────────────────────────────────────── */}
        {stats && !onboardingDone && <OnboardingCard onboarding={stats.onboarding} />}

        {/* ── Unbilled callout ────────────────────────────────── */}
        {stats && stats.unbilledViews > 0 && (
          <div className="flex items-center justify-between rounded-lg border border-primary/20 bg-primary/[0.04] px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/15">
                <Clock className="h-3.5 w-3.5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium">
                  {formatNum(stats.unbilledViews)} Views bereit zur Abrechnung
                </p>
                <p className="text-xs text-muted-foreground">{formatEur(stats.unbilledAmount)}</p>
              </div>
            </div>
            <Link
              href="/invoices"
              className="flex items-center gap-1 rounded-md bg-primary/15 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/25 transition-colors"
            >
              Rechnung erstellen <ArrowRight className="h-3 w-3 ml-1" />
            </Link>
          </div>
        )}

        {/* ── KPIs + Reliability ───────────────────────────────── */}
        {stats && (
          <div className="grid gap-3 lg:grid-cols-3">
            {/* KPI cards */}
            <div className="lg:col-span-2 space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <KpiCard icon={<Video className="h-3.5 w-3.5" />}     label="Videos"          value={formatNum(stats.videoCount)} />
                <KpiCard icon={<Eye className="h-3.5 w-3.5" />}       label="Gesamte Views"   value={formatNum(stats.totalViews)} />
                <KpiCard icon={<Euro className="h-3.5 w-3.5" />}      label="Gesamtverdienst" value={formatEur(stats.totalEarnings)} />
                <KpiCard icon={<TrendingUp className="h-3.5 w-3.5" />} label="Letzte 30 Tage" value={formatEur(stats.earnings30d)} />
              </div>
              <div className="rounded-lg border border-border bg-card px-4 py-3.5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Euro className="h-3.5 w-3.5 text-muted-foreground/40" />
                  <span className="text-xs text-muted-foreground">Deine Rate</span>
                </div>
                <p className="text-sm font-bold tabular-nums">
                  {new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(stats.ratePerView * 1000)}
                  <span className="text-xs font-normal text-muted-foreground ml-1">/ 1.000 Views</span>
                </p>
              </div>
            </div>

            {/* Reliability */}
            <div className="lg:col-span-1">
              {stats.reliabilityScore != null ? (
                <ReliabilityWidget score={stats.reliabilityScore} trustScore={stats.trustScore ?? 0} performanceScore={stats.performanceScore ?? 0} />
              ) : (
                <div className="h-full rounded-lg border border-border bg-card p-4 flex flex-col items-center justify-center min-h-[7rem] text-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-muted-foreground/20" />
                  <p className="text-xs text-muted-foreground">Score wird nach erster Verifikation berechnet</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Recent Videos ────────────────────────────────────── */}
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
            <h2 className="text-sm font-semibold">Letzte Videos</h2>
            <Link
              href="/videos"
              className="flex items-center gap-1 text-xs text-muted-foreground/70 hover:text-foreground transition-colors"
            >
              Alle anzeigen <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {videos.length === 0 ? (
            <div className="flex flex-col items-center py-16 px-6 text-center gap-2">
              <Video className="h-8 w-8 text-muted-foreground/15 mb-1" />
              <p className="text-sm font-medium">Noch keine Videos</p>
              <p className="text-xs text-muted-foreground">Reiche dein erstes Video ein, um Views zu tracken.</p>
              <Link
                href="/videos/submit"
                className="mt-2 flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:opacity-90 transition-opacity"
              >
                <Plus className="h-3.5 w-3.5" /> Erstes Video einreichen
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {videos.map((v) => (
                <Link
                  key={v.id}
                  href={`/videos/${v.id}`}
                  className="flex items-center justify-between px-5 py-3.5 hover:bg-accent/20 transition-colors"
                >
                  <div className="min-w-0 flex-1 mr-4 flex items-center gap-3">
                    <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${PLATFORM_DOT[v.platform] ?? "bg-muted-foreground/30"}`} />
                    <div className="min-w-0">
                      <p className="truncate text-sm">{v.title || v.url}</p>
                      <div className="mt-0.5 flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">{PLATFORM_LABELS[v.platform] || v.platform}</span>
                        <span className="text-xs text-muted-foreground/40">·</span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(v.created_at).toLocaleDateString("de-DE")}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold tabular-nums">{formatNum(v.current_views)}</p>
                    {v.unbilled_views > 0 && (
                      <p className="text-xs text-primary font-medium">+{formatNum(v.unbilled_views)}</p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* ── Quick links ──────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { href: "/videos/submit", label: "Video einreichen",  icon: <Plus className="h-3.5 w-3.5" /> },
            { href: "/invoices",      label: "Rechnung erstellen", icon: <Receipt className="h-3.5 w-3.5" /> },
            { href: "/accounts",      label: "Konten verwalten",   icon: <Link2 className="h-3.5 w-3.5" /> },
            { href: "/profile",       label: "Profil bearbeiten",  icon: <User className="h-3.5 w-3.5" /> },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2.5 text-xs text-muted-foreground hover:border-border/80 hover:text-foreground hover:bg-accent/30 transition-all duration-150"
            >
              {item.icon}
              {item.label}
            </Link>
          ))}
        </div>

      </main>
    </>
  );
}
