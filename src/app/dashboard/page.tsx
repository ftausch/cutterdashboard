"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CutterNav } from "@/components/cutter-nav";
import {
  Eye, Video, Euro, TrendingUp, Clock, Plus, Receipt,
  CheckCircle, Circle, User, Link2, Upload, ArrowRight,
  Sparkles, ChevronRight, ShieldCheck,
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
  youtube: "YouTube",
  tiktok: "TikTok",
  instagram: "Instagram",
  facebook: "Facebook",
};

const PLATFORM_COLORS: Record<string, string> = {
  youtube: "bg-red-500/10 text-red-400 border border-red-500/20",
  tiktok: "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20",
  instagram: "bg-pink-500/10 text-pink-400 border border-pink-500/20",
  facebook: "bg-blue-500/10 text-blue-400 border border-blue-500/20",
};

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
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

// ── Skeleton ─────────────────────────────────────────────────
function DashboardSkeleton() {
  return (
    <>
      <CutterNav />
      <main className="mx-auto max-w-6xl p-6">
        {/* Greeting skeleton */}
        <div className="mb-8">
          <div className="skeleton h-7 w-64 mb-2" />
          <div className="skeleton h-4 w-40" />
        </div>
        {/* Stat + reliability skeleton */}
        <div className="mb-8 grid gap-4 lg:grid-cols-5">
          <div className="lg:col-span-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="rounded-xl border border-border bg-card p-3">
                <div className="skeleton h-4 w-4 mb-2.5" />
                <div className="skeleton h-6 w-14 mb-1" />
                <div className="skeleton h-3 w-20" />
              </div>
            ))}
          </div>
          <div className="lg:col-span-2 rounded-xl border border-border bg-card p-5 h-40" />
        </div>
        {/* Table skeleton */}
        <div className="rounded-xl border border-border bg-card">
          <div className="border-b border-border px-5 py-3">
            <div className="skeleton h-5 w-32" />
          </div>
          {[...Array(4)].map((_, i) => (
            <div key={i} className="flex items-center justify-between px-5 py-3.5 border-b border-border last:border-0">
              <div>
                <div className="skeleton h-4 w-48 mb-1.5" />
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

// ── Onboarding ────────────────────────────────────────────────
function OnboardingCard({ onboarding }: { onboarding: Onboarding }) {
  const steps = [
    {
      done: onboarding.profileComplete,
      num: 1,
      icon: <User className="h-4 w-4" />,
      title: "Profil vervollständigen",
      description: "Firma, Adresse, Steuernummer und IBAN eintragen",
      href: "/profile",
    },
    {
      done: onboarding.hasAccounts,
      num: 2,
      icon: <Link2 className="h-4 w-4" />,
      title: "Social-Media-Konto verknüpfen",
      description: "Mindestens ein Konto (TikTok, YouTube, etc.) verbinden",
      href: "/accounts",
    },
    {
      done: onboarding.hasVideos,
      num: 3,
      icon: <Upload className="h-4 w-4" />,
      title: "Erstes Video einreichen",
      description: "Video-URL einreichen, damit Views getrackt werden",
      href: "/videos/submit",
    },
  ];

  const completed = steps.filter((s) => s.done).length;
  const pct = Math.round((completed / steps.length) * 100);

  return (
    <div className="mb-8 rounded-xl border border-primary/20 bg-primary/5 p-5">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <Sparkles className="h-4 w-4 text-primary" />
            <h2 className="font-semibold text-sm">Einrichtung</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            {completed} von {steps.length} Schritten erledigt
          </p>
        </div>
        <span className="text-sm font-bold text-primary">{pct}%</span>
      </div>

      {/* Progress bar */}
      <div className="mb-5 h-1.5 w-full rounded-full bg-primary/15 overflow-hidden">
        <div
          className="h-full rounded-full bg-primary transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="space-y-2">
        {steps.map((step) => (
          <Link
            key={step.num}
            href={step.href}
            className={`flex items-center gap-3 rounded-lg border p-3 transition-all duration-150 ${
              step.done
                ? "border-primary/20 bg-primary/8 opacity-60"
                : "border-border hover:border-primary/30 hover:bg-accent/50 cursor-pointer"
            }`}
          >
            <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors ${
              step.done
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground"
            }`}>
              {step.done ? <CheckCircle className="h-3.5 w-3.5" /> : step.num}
            </div>
            <div className="min-w-0 flex-1">
              <p className={`text-sm font-medium ${step.done ? "line-through text-muted-foreground" : ""}`}>
                {step.title}
              </p>
              {!step.done && (
                <p className="text-xs text-muted-foreground mt-0.5">{step.description}</p>
              )}
            </div>
            {!step.done && <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
          </Link>
        ))}
      </div>
    </div>
  );
}

// ── Reliability Widget ────────────────────────────────────────
type ScoreLabel = 'excellent' | 'strong' | 'average' | 'risky' | 'critical';
const SCORE_LABEL_META: Record<ScoreLabel, { de: string; color: string; bg: string; border: string; barColor: string }> = {
  excellent: { de: "Ausgezeichnet", color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/30", barColor: "bg-emerald-500" },
  strong:    { de: "Stark",         color: "text-green-400",   bg: "bg-green-500/10",   border: "border-green-500/30",   barColor: "bg-green-500"   },
  average:   { de: "Durchschnitt",  color: "text-yellow-400",  bg: "bg-yellow-500/10",  border: "border-yellow-500/30",  barColor: "bg-yellow-500"  },
  risky:     { de: "Riskant",       color: "text-orange-400",  bg: "bg-orange-500/10",  border: "border-orange-500/30",  barColor: "bg-orange-500"  },
  critical:  { de: "Kritisch",      color: "text-red-400",     bg: "bg-red-500/10",     border: "border-red-500/30",     barColor: "bg-red-500"     },
};
function getScoreLabel(score: number): ScoreLabel {
  if (score >= 85) return 'excellent';
  if (score >= 70) return 'strong';
  if (score >= 50) return 'average';
  if (score >= 30) return 'risky';
  return 'critical';
}
function ReliabilityWidget({ score, trustScore, performanceScore }: {
  score: number; trustScore: number; performanceScore: number;
}) {
  const label = getScoreLabel(score);
  const meta = SCORE_LABEL_META[label];
  return (
    <div className={`h-full rounded-xl border ${meta.border} ${meta.bg} p-5 flex flex-col justify-between`}>
      {/* Top: score + badge */}
      <div>
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className={`h-4 w-4 ${meta.color}`} />
            <span className="text-xs font-medium text-muted-foreground">Zuverlässigkeit</span>
          </div>
          <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${meta.bg} ${meta.color} border ${meta.border}`}>
            {meta.de}
          </span>
        </div>
        <div className="flex items-baseline gap-1.5 mb-3">
          <span className={`text-4xl font-black tabular-nums leading-none ${meta.color}`}>{score}</span>
          <span className="text-sm text-muted-foreground">/100</span>
        </div>
        {/* Progress bar */}
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/40 mb-4">
          <div className={`h-full rounded-full transition-all ${meta.barColor}`} style={{ width: `${score}%` }} />
        </div>
      </div>
      {/* Sub-scores */}
      <div className="flex items-center gap-4 border-t border-border/50 pt-3">
        <div className="flex-1">
          <p className={`text-lg font-bold tabular-nums ${meta.color}`}>{trustScore}</p>
          <p className="text-xs text-muted-foreground">Trust <span className="opacity-50">70%</span></p>
        </div>
        <div className="w-px h-8 bg-border/50" />
        <div className="flex-1">
          <p className={`text-lg font-bold tabular-nums ${meta.color}`}>{performanceScore}</p>
          <p className="text-xs text-muted-foreground">Performance <span className="opacity-50">30%</span></p>
        </div>
      </div>
    </div>
  );
}

// ── Stat Card ─────────────────────────────────────────────────
function StatCard({
  icon, label, value, sub, highlight, href,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
  href?: string;
}) {
  const inner = (
    <div className={`relative rounded-xl border p-3 h-full transition-all duration-200 card-hover ${
      highlight
        ? "border-primary/30 bg-primary/8"
        : "border-border bg-card"
    }`}>
      {highlight && (
        <div className="absolute inset-x-0 top-0 h-0.5 rounded-t-xl bg-primary opacity-60" />
      )}
      <div className={`mb-1.5 ${highlight ? "text-primary" : "text-muted-foreground"}`}>
        {icon}
      </div>
      <p className={`text-lg font-bold tabular-nums ${highlight ? "text-primary" : ""}`}>
        {value}
      </p>
      {sub && <p className="text-xs font-medium text-primary mt-0.5">{sub}</p>}
      <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block h-full">
        {inner}
      </Link>
    );
  }
  return inner;
}

// ── Main Page ─────────────────────────────────────────────────
export default function CutterDashboard() {
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [videos, setVideos] = useState<VideoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sessionName, setSessionName] = useState<string>("");

  useEffect(() => {
    // Load session name separately for faster greeting render
    fetch("/api/auth/session")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => d?.name && setSessionName(d.name.split(" ")[0]));

    Promise.all([
      fetch("/api/stats").then((r) => {
        if (r.status === 401) { router.push("/login"); return null; }
        return r.json();
      }),
      fetch("/api/videos").then((r) => r.json()),
    ]).then(([statsData, videosData]) => {
      if (statsData) setStats(statsData);
      if (videosData?.videos) setVideos(videosData.videos.slice(0, 5));
      setLoading(false);
    });
  }, [router]);

  if (loading) return <DashboardSkeleton />;

  const onboardingDone =
    stats?.onboarding.profileComplete &&
    stats?.onboarding.hasAccounts &&
    stats?.onboarding.hasVideos;

  return (
    <>
      <CutterNav />
      <main className="mx-auto max-w-6xl p-6">

        {/* Greeting */}
        <div className="mb-7 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black tracking-tight">
              {getGreeting()}{sessionName ? `, ${sessionName}` : ""}
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {new Date().toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" })}
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Link
              href="/videos/submit"
              className="btn-glow flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:block">Video einreichen</span>
              <span className="sm:hidden">Neu</span>
            </Link>
            <Link
              href="/invoices"
              className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-accent transition-colors"
            >
              <Receipt className="h-4 w-4" />
              <span className="hidden sm:block">Rechnungen</span>
            </Link>
          </div>
        </div>

        {/* Onboarding — only if not complete */}
        {stats && !onboardingDone && (
          <OnboardingCard onboarding={stats.onboarding} />
        )}

        {/* Unbilled callout — only if there are unbilled views */}
        {stats && stats.unbilledViews > 0 && (
          <div className="mb-6 flex items-center justify-between rounded-xl border border-primary/25 bg-primary/8 px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20">
                <Clock className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold">
                  {formatNum(stats.unbilledViews)} neue Views bereit zur Abrechnung
                </p>
                <p className="text-xs text-muted-foreground">
                  entspricht {formatEur(stats.unbilledAmount)}
                </p>
              </div>
            </div>
            <Link
              href="/invoices"
              className="flex items-center gap-1 rounded-lg bg-primary/20 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/30 transition-colors"
            >
              Rechnung erstellen
              <ArrowRight className="h-3.5 w-3.5 ml-1" />
            </Link>
          </div>
        )}

        {/* KPI + Reliability two-column layout */}
        {stats && (
          <div className="mb-7 grid gap-4 lg:grid-cols-5">
            {/* 4 compact KPI cards */}
            <div className="lg:col-span-3 grid grid-cols-2 sm:grid-cols-4 gap-3 content-start">
              <StatCard
                icon={<Video className="h-4 w-4" />}
                label="Videos"
                value={formatNum(stats.videoCount)}
              />
              <StatCard
                icon={<Eye className="h-4 w-4" />}
                label="Gesamte Views"
                value={formatNum(stats.totalViews)}
              />
              <StatCard
                icon={<Euro className="h-4 w-4" />}
                label="Gesamtverdienst"
                value={formatEur(stats.totalEarnings)}
              />
              <StatCard
                icon={<TrendingUp className="h-4 w-4" />}
                label="Letzte 30 Tage"
                value={formatEur(stats.earnings30d)}
              />
            </div>
            {/* Reliability score card */}
            {stats.reliabilityScore != null ? (
              <div className="lg:col-span-2">
                <ReliabilityWidget
                  score={stats.reliabilityScore}
                  trustScore={stats.trustScore ?? 0}
                  performanceScore={stats.performanceScore ?? 0}
                />
              </div>
            ) : (
              <div className="lg:col-span-2 rounded-xl border border-border bg-card p-5 flex items-center justify-center">
                <p className="text-xs text-muted-foreground">Noch kein Score verfügbar</p>
              </div>
            )}
          </div>
        )}

        {/* Recent Videos */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
            <h2 className="font-semibold text-sm">Letzte Videos</h2>
            <Link
              href="/videos"
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Alle anzeigen
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {videos.length === 0 ? (
            <div className="flex flex-col items-center py-14 px-6 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
                <Video className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium mb-1">Noch keine Videos</p>
              <p className="text-xs text-muted-foreground mb-4">
                Reiche dein erstes Video ein, um Views zu tracken.
              </p>
              <Link
                href="/videos/submit"
                className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
              >
                <Plus className="h-4 w-4" />
                Erstes Video einreichen
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {videos.map((v) => (
                <div
                  key={v.id}
                  className="flex items-center justify-between px-5 py-3.5 hover:bg-accent/30 transition-colors"
                >
                  <div className="min-w-0 flex-1 mr-4">
                    <p className="truncate text-sm font-medium">
                      {v.title || v.url}
                    </p>
                    <div className="mt-1 flex items-center gap-2">
                      <span className={`rounded-md px-1.5 py-0.5 text-xs font-medium ${PLATFORM_COLORS[v.platform] || "bg-muted text-muted-foreground"}`}>
                        {PLATFORM_LABELS[v.platform] || v.platform}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(v.created_at).toLocaleDateString("de-DE")}
                      </span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold tabular-nums">
                      {formatNum(v.current_views)}
                      <span className="text-xs font-normal text-muted-foreground ml-1">Views</span>
                    </p>
                    {v.unbilled_views > 0 && (
                      <p className="text-xs font-medium text-primary">
                        +{formatNum(v.unbilled_views)} neu
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick links — always visible */}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { href: "/videos/submit", label: "Video einreichen", icon: <Plus className="h-4 w-4" /> },
            { href: "/invoices", label: "Rechnung erstellen", icon: <Receipt className="h-4 w-4" /> },
            { href: "/accounts", label: "Konten verwalten", icon: <Link2 className="h-4 w-4" /> },
            { href: "/profile", label: "Profil bearbeiten", icon: <User className="h-4 w-4" /> },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground hover:border-primary/30 hover:text-foreground hover:bg-accent/50 transition-all duration-150"
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
