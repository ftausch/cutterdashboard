"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { CutterNav } from "@/components/cutter-nav";
import {
  ArrowLeft, RefreshCw, Flag, ExternalLink, CheckCircle2,
  AlertTriangle, ShieldCheck, User, TrendingUp, Target,
  BarChart3, Info,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────

interface CutterProfile {
  id: string | null;
  name: string | null;
  email: string | null;
  role: string | null;
  is_active: number | null;
  rate_per_view: number | null;
  monthly_clip_minimum: number | null;
  created_at: string | null;
  last_calculated_at: string | null;
  // Scores
  reliability_score: number;
  trust_score: number;
  performance_score: number;
  // Trust components
  claim_accuracy_score: number;
  completeness_score: number;
  proof_score: number;
  behavioral_score: number;
  // Performance components
  volume_score: number;
  views_score: number;
  platform_score: number;
  // Raw stats
  total_videos: number;
  verified_count: number;
  accurate_count: number;
  verifiable_count: number;
  suspicious_count: number;
  critical_count: number;
  proof_approved_count: number;
  proof_rejected_count: number;
  flagged_count: number;
  avg_views: number;
  total_views: number;
  platform_count: number;
  completeness_rate: number; // 0–100
}

interface Clip {
  id: string | null;
  platform: string | null;
  url: string | null;
  title: string | null;
  current_views: number | null;
  claimed_views: number | null;
  verification_status: string | null;
  verification_source: string | null;
  confidence_level: number | null;
  discrepancy_status: string | null;
  discrepancy_percent: number | null;
  is_flagged: number;
  last_scraped_at: string | null;
  created_at: string | null;
  episode_title: string | null;
}

interface PlatformBreakdown {
  platform: string | null;
  count: number;
  total_views: number;
  verified_count: number;
}

interface AuditEntry {
  actor_name: string | null;
  action: string | null;
  entity_id: string | null;
  meta: string | null;
  created_at: string | null;
}

interface ScoreHistoryEntry {
  day: string | null;
  score: number;
  trust_score: number;
  performance_score: number;
}

interface CutterProfileResponse {
  cutter: CutterProfile;
  clips: Clip[];
  platforms: PlatformBreakdown[];
  auditTrail: AuditEntry[];
  scoreHistory: ScoreHistoryEntry[];
}

// ── Helpers ───────────────────────────────────────────────────

const PLATFORM_LABELS: Record<string, string> = {
  youtube: "YouTube", tiktok: "TikTok", instagram: "Instagram", facebook: "Facebook",
};
const PLATFORM_ICONS: Record<string, string> = {
  youtube: "YT", tiktok: "TK", instagram: "IG", facebook: "FB",
};
const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  verified:           { label: "Verifiziert",  cls: "bg-emerald-500/10 text-emerald-400" },
  partially_verified: { label: "Teilweise",    cls: "bg-yellow-500/10 text-yellow-400" },
  unverified:         { label: "Ausstehend",   cls: "bg-muted/50 text-muted-foreground" },
  claimed_only:       { label: "Nur Angabe",   cls: "bg-orange-500/10 text-orange-400" },
  manual_proof:       { label: "Beleg",        cls: "bg-blue-500/10 text-blue-400" },
  unavailable:        { label: "—",            cls: "bg-muted/50 text-muted-foreground" },
};
const DISC_LABELS: Record<string, { label: string; cls: string }> = {
  match:                 { label: "Match",      cls: "text-emerald-400" },
  minor_difference:      { label: "Gering",     cls: "text-yellow-400" },
  suspicious_difference: { label: "Verdächtig", cls: "text-orange-400" },
  critical_difference:   { label: "Kritisch",   cls: "text-red-400" },
  no_data:               { label: "—",          cls: "text-muted-foreground" },
};

type ScoreLabel = 'excellent' | 'strong' | 'average' | 'risky' | 'critical';
const LABEL_META: Record<ScoreLabel, { de: string; color: string; bg: string; border: string }> = {
  excellent: { de: "Ausgezeichnet", color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/30" },
  strong:    { de: "Stark",         color: "text-green-400",   bg: "bg-green-500/10",   border: "border-green-500/30"   },
  average:   { de: "Durchschnitt",  color: "text-yellow-400",  bg: "bg-yellow-500/10",  border: "border-yellow-500/30"  },
  risky:     { de: "Riskant",       color: "text-orange-400",  bg: "bg-orange-500/10",  border: "border-orange-500/30"  },
  critical:  { de: "Kritisch",      color: "text-red-400",     bg: "bg-red-500/10",     border: "border-red-500/30"     },
};

function getLabel(score: number): ScoreLabel {
  if (score >= 85) return 'excellent';
  if (score >= 70) return 'strong';
  if (score >= 50) return 'average';
  if (score >= 30) return 'risky';
  return 'critical';
}

function scoreBarColor(score: number): string {
  if (score >= 85) return "bg-emerald-500";
  if (score >= 70) return "bg-green-500";
  if (score >= 50) return "bg-yellow-500";
  if (score >= 30) return "bg-orange-500";
  return "bg-red-500";
}

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
  return `vor ${days}T`;
}

function formatDateTime(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("de-DE", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function getInitials(name: string): string {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

// ── Score Component Bar ───────────────────────────────────────
function ComponentBar({
  label, value, max, color, hint,
}: {
  label: string; value: number; max: number; color: string; hint?: string;
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <span>{label}</span>
          {hint && (
            <span className="group relative cursor-help">
              <Info className="h-3 w-3 opacity-40 hover:opacity-70" />
              <span className="pointer-events-none absolute bottom-full left-0 z-10 mb-1 hidden w-48 rounded-lg border border-border bg-card p-2 text-xs text-muted-foreground shadow-md group-hover:block">
                {hint}
              </span>
            </span>
          )}
        </div>
        <span className="tabular-nums font-medium text-foreground">{value}<span className="text-muted-foreground">/{max}</span></span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ── Sparkline ─────────────────────────────────────────────────
function ScoreSparkline({ history }: { history: ScoreHistoryEntry[] }) {
  if (history.length < 2) {
    return (
      <div className="flex items-center justify-center h-16 text-xs text-muted-foreground">
        Nicht genug Datenpunkte (mind. 2 Tage)
      </div>
    );
  }
  const max = Math.max(...history.map(h => h.score), 1);
  const min = Math.min(...history.map(h => h.score));
  const range = max - min || 1;
  const W = 100;
  const H = 48;
  const stepX = W / (history.length - 1);

  const points = history.map((h, i) => {
    const x = i * stepX;
    const y = H - ((h.score - min) / range) * (H - 8) - 4;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");

  const lastScore = history[history.length - 1].score;
  const firstScore = history[0].score;
  const trend = lastScore - firstScore;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Letzte 30 Tage</span>
        <span className={trend > 0 ? "text-emerald-400" : trend < 0 ? "text-red-400" : "text-muted-foreground"}>
          {trend > 0 ? `▲ +${trend}` : trend < 0 ? `▼ ${trend}` : "─ Stabil"}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-12" preserveAspectRatio="none">
        {/* Fill area */}
        <defs>
          <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.25" />
            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <polyline
          points={points}
          fill="none"
          stroke="hsl(var(--primary))"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Dots for last point */}
        {(() => {
          const last = history[history.length - 1];
          const lx = (history.length - 1) * stepX;
          const ly = H - ((last.score - min) / range) * (H - 8) - 4;
          return <circle cx={lx.toFixed(1)} cy={ly.toFixed(1)} r="2.5" fill="hsl(var(--primary))" />;
        })()}
      </svg>
      {/* Day labels — only first and last */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{history[0].day?.slice(5)}</span>
        <span className={`font-semibold ${scoreBarColor(lastScore).replace('bg-', 'text-').replace('-500', '-400')}`}>
          {lastScore}
        </span>
        <span>{history[history.length - 1].day?.slice(5)}</span>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────
export default function CutterProfilePage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [data, setData] = useState<CutterProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [showScoreDetail, setShowScoreDetail] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/ops/cutters/${id}`);
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
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center gap-4">
              <div className="skeleton h-14 w-14 rounded-full" />
              <div className="space-y-2 flex-1">
                <div className="skeleton h-5 w-40" />
                <div className="skeleton h-4 w-56" />
              </div>
            </div>
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

  const { cutter, clips, platforms, auditTrail, scoreHistory } = data;
  const label = getLabel(cutter.reliability_score);
  const labelMeta = LABEL_META[label];

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

        {/* Header card */}
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-start gap-4 flex-wrap">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary/20 text-lg font-bold text-primary">
              {cutter.name ? getInitials(cutter.name) : <User className="h-6 w-6" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <h1 className="text-xl font-bold">{cutter.name ?? "Unbekannt"}</h1>
                <span className={`rounded px-2 py-0.5 text-xs font-medium ${
                  cutter.role === "super_admin" ? "bg-primary/15 text-primary"
                    : cutter.role === "ops_manager" ? "bg-blue-500/10 text-blue-400"
                    : "bg-muted text-muted-foreground"
                }`}>
                  {cutter.role === "super_admin" ? "Admin"
                    : cutter.role === "ops_manager" ? "Ops Manager"
                    : "Cutter"}
                </span>
                <span className={`rounded px-2 py-0.5 text-xs font-medium ${
                  cutter.is_active ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
                }`}>
                  {cutter.is_active ? "Aktiv" : "Inaktiv"}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">{cutter.email ?? "—"}</p>
              <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground flex-wrap">
                {cutter.rate_per_view != null && <span>Rate: {cutter.rate_per_view.toFixed(4)} €/View</span>}
                {cutter.monthly_clip_minimum != null && <span>Min. Clips/Mo: {cutter.monthly_clip_minimum}</span>}
                {cutter.created_at && <span>Seit: {formatDateTime(cutter.created_at)}</span>}
                {cutter.last_calculated_at && (
                  <span className="text-muted-foreground/60">Score berechnet: {formatRelative(cutter.last_calculated_at)}</span>
                )}
              </div>
            </div>
            <button onClick={load} className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm hover:bg-accent transition-colors">
              <RefreshCw className="h-4 w-4" />
              Aktualisieren
            </button>
          </div>
        </div>

        {/* ── SCORE OVERVIEW ── */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">

          {/* Big score card */}
          <div className={`rounded-xl border ${labelMeta.border} ${labelMeta.bg} p-5 flex flex-col justify-between`}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Gesamt-Score</p>
                <div className="flex items-end gap-2">
                  <span className={`text-5xl font-black tabular-nums ${labelMeta.color}`}>
                    {cutter.reliability_score}
                  </span>
                  <span className="text-muted-foreground text-sm mb-1">/100</span>
                </div>
              </div>
              <span className={`rounded-md px-2.5 py-1 text-xs font-semibold ${labelMeta.bg} ${labelMeta.color} border ${labelMeta.border}`}>
                {labelMeta.de}
              </span>
            </div>
            {/* Combined bar */}
            <div className="mt-4 space-y-1.5">
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted/50">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${scoreBarColor(cutter.reliability_score)}`}
                  style={{ width: `${cutter.reliability_score}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>0 — Kritisch</span>
                <span>100 — Ausgezeichnet</span>
              </div>
            </div>
            <button
              onClick={() => setShowScoreDetail(!showScoreDetail)}
              className="mt-3 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <BarChart3 className="h-3.5 w-3.5" />
              {showScoreDetail ? "Aufschlüsselung ausblenden" : "Score-Aufschlüsselung anzeigen"}
            </button>
          </div>

          {/* Trust sub-score */}
          <div className="rounded-xl border border-border bg-card p-5 space-y-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-blue-400" />
              <p className="text-sm font-semibold">Trust Score</p>
              <span className="ml-auto text-xl font-bold tabular-nums">{cutter.trust_score}<span className="text-sm text-muted-foreground">/100</span></span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div className={`h-full rounded-full ${scoreBarColor(cutter.trust_score)}`} style={{ width: `${cutter.trust_score}%` }} />
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Gewichtet mit <span className="font-semibold text-foreground">70%</span> des Gesamtscores. Misst Genauigkeit, Vollständigkeit, Belegnachweise und Verhalten.
            </p>
            <div className="grid grid-cols-2 gap-1.5 text-xs">
              <div className="rounded-md bg-muted/30 px-2 py-1.5 text-center">
                <p className="text-muted-foreground">Genauigkeit</p>
                <p className="font-bold text-foreground">{cutter.claim_accuracy_score}/35</p>
              </div>
              <div className="rounded-md bg-muted/30 px-2 py-1.5 text-center">
                <p className="text-muted-foreground">Vollständigkeit</p>
                <p className="font-bold text-foreground">{cutter.completeness_score}/20</p>
              </div>
              <div className="rounded-md bg-muted/30 px-2 py-1.5 text-center">
                <p className="text-muted-foreground">Belege</p>
                <p className="font-bold text-foreground">{cutter.proof_score}/20</p>
              </div>
              <div className="rounded-md bg-muted/30 px-2 py-1.5 text-center">
                <p className="text-muted-foreground">Verhalten</p>
                <p className="font-bold text-foreground">{cutter.behavioral_score}/25</p>
              </div>
            </div>
          </div>

          {/* Performance sub-score */}
          <div className="rounded-xl border border-border bg-card p-5 space-y-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-purple-400" />
              <p className="text-sm font-semibold">Performance Score</p>
              <span className="ml-auto text-xl font-bold tabular-nums">{cutter.performance_score}<span className="text-sm text-muted-foreground">/100</span></span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div className={`h-full rounded-full ${scoreBarColor(cutter.performance_score)}`} style={{ width: `${cutter.performance_score}%` }} />
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Gewichtet mit <span className="font-semibold text-foreground">30%</span> des Gesamtscores. Hohe Views gleichen keine falschen Angaben aus.
            </p>
            <div className="grid grid-cols-3 gap-1.5 text-xs">
              <div className="rounded-md bg-muted/30 px-2 py-1.5 text-center">
                <p className="text-muted-foreground">Volumen</p>
                <p className="font-bold text-foreground">{cutter.volume_score}/40</p>
              </div>
              <div className="rounded-md bg-muted/30 px-2 py-1.5 text-center">
                <p className="text-muted-foreground">∅ Views</p>
                <p className="font-bold text-foreground">{cutter.views_score}/40</p>
              </div>
              <div className="rounded-md bg-muted/30 px-2 py-1.5 text-center">
                <p className="text-muted-foreground">Plattformen</p>
                <p className="font-bold text-foreground">{cutter.platform_score}/20</p>
              </div>
            </div>
          </div>
        </div>

        {/* Score breakdown detail (expandable) */}
        {showScoreDetail && (
          <div className="rounded-xl border border-border bg-card p-5 space-y-6">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-muted-foreground" />
              <h2 className="font-semibold text-sm">Score-Aufschlüsselung</h2>
            </div>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              {/* Trust components */}
              <div className="space-y-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-blue-400">Trust-Komponenten (70%)</p>
                <ComponentBar
                  label="Angaben-Genauigkeit"
                  value={cutter.claim_accuracy_score} max={35}
                  color="bg-blue-500"
                  hint={`${cutter.verifiable_count} prüfbare Clips. ${cutter.accurate_count} stimmten überein. Strafe: ${cutter.suspicious_count} verdächtig (×5), ${cutter.critical_count} kritisch (×12).`}
                />
                <ComponentBar
                  label="Vollständigkeit"
                  value={cutter.completeness_score} max={20}
                  color="bg-indigo-500"
                  hint={`${cutter.completeness_rate}% der Clips haben eine Angabe (claimed_views).`}
                />
                <ComponentBar
                  label="Beleg-Track-Record"
                  value={cutter.proof_score} max={20}
                  color="bg-violet-500"
                  hint={`${cutter.proof_approved_count} genehmigt, ${cutter.proof_rejected_count} abgelehnt. Mehr als 8 Genehmigungen werden auf max. 16 gedeckelt.`}
                />
                <ComponentBar
                  label="Verhaltens-Score"
                  value={cutter.behavioral_score} max={25}
                  color="bg-cyan-500"
                  hint={`Startet bei 25. Abzug: ${cutter.flagged_count} Flags (×6), ${cutter.critical_count} kritische Abweichungen (×3).`}
                />
              </div>

              {/* Performance components */}
              <div className="space-y-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-purple-400">Performance-Komponenten (30%)</p>
                <ComponentBar
                  label="Clip-Volumen"
                  value={cutter.volume_score} max={40}
                  color="bg-purple-500"
                  hint={`${cutter.total_videos} Clips eingereicht. Skala: 1–3→10, 4–8→18, 9–20→27, 21–40→33, 41+→40.`}
                />
                <ComponentBar
                  label="∅ Views pro Clip"
                  value={cutter.views_score} max={40}
                  color="bg-fuchsia-500"
                  hint={`Durchschnitt: ${formatNum(cutter.avg_views)} Views/Clip. Logarithmische Skala.`}
                />
                <ComponentBar
                  label="Plattform-Diversität"
                  value={cutter.platform_score} max={20}
                  color="bg-pink-500"
                  hint={`${cutter.platform_count} Plattform(en) aktiv. 1→8, 2→14, 3+→20 Punkte.`}
                />

                {/* Anti-gaming notice */}
                <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2.5 text-xs text-amber-300/80 space-y-1">
                  <p className="font-medium text-amber-300">Anti-Gaming-Regeln</p>
                  <p>· Hohe Views gleichen keine falschen Angaben aus (Trust = 70%)</p>
                  <p>· Viele Beleg-Genehmigungen ≠ höheres Vertrauen (max. 16/20)</p>
                  <p>· Kleines, präzises Portfolio erzielt starken Trust-Score</p>
                </div>
              </div>
            </div>

            {/* Raw stats row */}
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 rounded-lg border border-border bg-muted/10 p-3 text-xs text-center">
              {[
                { label: "Clips", val: cutter.total_videos },
                { label: "Verifiziert", val: cutter.verified_count },
                { label: "Verdächtig", val: cutter.suspicious_count },
                { label: "Kritisch", val: cutter.critical_count },
                { label: "Geflaggt", val: cutter.flagged_count },
                { label: "∅ Views", val: formatNum(cutter.avg_views) },
              ].map(({ label, val }) => (
                <div key={label}>
                  <p className="text-muted-foreground">{label}</p>
                  <p className="font-bold text-foreground mt-0.5">{val}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Score trend chart */}
        <div className="rounded-xl border border-border bg-card p-5 space-y-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
            <h2 className="font-semibold text-sm">Score-Verlauf</h2>
          </div>
          <ScoreSparkline history={scoreHistory} />
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="mb-2 text-muted-foreground"><ShieldCheck className="h-4 w-4" /></div>
            <p className="text-2xl font-bold">{cutter.total_videos}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Clips gesamt</p>
          </div>
          <div className="rounded-xl border border-emerald-500/20 bg-card p-4">
            <div className="mb-2 text-emerald-400"><CheckCircle2 className="h-4 w-4" /></div>
            <p className="text-2xl font-bold">
              {cutter.total_videos > 0 ? Math.round((cutter.verified_count / cutter.total_videos) * 100) : 0}%
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">Verifiziert</p>
          </div>
          <div className="rounded-xl border border-orange-500/20 bg-card p-4">
            <div className="mb-2 text-orange-400"><AlertTriangle className="h-4 w-4" /></div>
            <p className="text-2xl font-bold">{(cutter.suspicious_count ?? 0) + (cutter.critical_count ?? 0)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Verdächtig / Kritisch</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="mb-2 text-muted-foreground"><TrendingUp className="h-4 w-4" /></div>
            <p className="text-2xl font-bold">{formatNum(cutter.avg_views)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">∅ Views/Clip</p>
          </div>
        </div>

        {/* Platform breakdown */}
        {platforms.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <h2 className="font-semibold text-sm">Plattform-Übersicht</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {platforms.map((p) => (
                <div key={p.platform} className="rounded-lg border border-border bg-muted/10 p-3 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-bold">
                      {PLATFORM_ICONS[p.platform ?? ""] ?? (p.platform ?? "?").toUpperCase().slice(0, 2)}
                    </span>
                    <span className="text-xs font-medium">
                      {PLATFORM_LABELS[p.platform ?? ""] ?? p.platform ?? "—"}
                    </span>
                  </div>
                  <p className="text-lg font-bold">{formatNum(p.total_views)}</p>
                  <div className="text-xs text-muted-foreground">
                    <span>{p.count} Clips</span>
                    <span className="mx-1">·</span>
                    <span className="text-emerald-400">{p.verified_count} verif.</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Clips table */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-5 py-3 border-b border-border flex items-center justify-between">
            <h2 className="font-semibold text-sm">Alle Clips ({clips.length})</h2>
          </div>
          {clips.length === 0 ? (
            <div className="px-5 py-12 text-center text-muted-foreground">
              <ShieldCheck className="h-8 w-8 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Keine Clips vorhanden</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Episode</th>
                    <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Plattform</th>
                    <th className="px-3 py-2.5 text-left font-medium text-muted-foreground max-w-48">Clip</th>
                    <th className="px-3 py-2.5 text-right font-medium text-muted-foreground">Views</th>
                    <th className="px-3 py-2.5 text-right font-medium text-muted-foreground">Angabe</th>
                    <th className="px-3 py-2.5 text-right font-medium text-muted-foreground">Disc.%</th>
                    <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Status</th>
                    <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Sync</th>
                    <th className="px-3 py-2.5 text-center font-medium text-muted-foreground">Detail</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {clips.map((clip) => {
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
                        <td className="px-3 py-3 text-xs text-muted-foreground max-w-32 truncate">
                          {clip.episode_title ?? "—"}
                        </td>
                        <td className="px-3 py-3">
                          <span className="rounded bg-muted px-1.5 py-0.5 text-xs">
                            {PLATFORM_LABELS[clip.platform ?? ""] ?? clip.platform ?? "—"}
                          </span>
                        </td>
                        <td className="px-3 py-3 max-w-48">
                          {clip.url ? (
                            <a href={clip.url} target="_blank" rel="noopener noreferrer"
                              className="flex items-center gap-1 truncate text-xs hover:text-primary" title={clip.title ?? ""}>
                              <span className="truncate">{clip.title ?? clip.url}</span>
                              <ExternalLink className="h-3 w-3 shrink-0 opacity-50" />
                            </a>
                          ) : (
                            <span className="text-xs text-muted-foreground truncate block">{clip.title ?? "—"}</span>
                          )}
                          {clip.is_flagged ? (
                            <span className="text-xs text-red-400 flex items-center gap-0.5 mt-0.5">
                              <Flag className="h-3 w-3" /> Geflaggt
                            </span>
                          ) : null}
                        </td>
                        <td className="px-3 py-3 text-right text-xs font-mono">{formatNum(clip.current_views)}</td>
                        <td className="px-3 py-3 text-right text-xs font-mono">{formatNum(clip.claimed_views)}</td>
                        <td className="px-3 py-3 text-right text-xs">
                          {clip.discrepancy_percent != null ? (
                            <span className={discCfg.cls}>
                              {clip.discrepancy_percent > 0 ? "+" : ""}{clip.discrepancy_percent.toFixed(1)}%
                            </span>
                          ) : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-3 py-3">
                          <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${statusCfg.cls}`}>
                            {statusCfg.label}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-xs text-muted-foreground whitespace-nowrap">
                          {formatRelative(clip.last_scraped_at)}
                        </td>
                        <td className="px-3 py-3 text-center">
                          <Link href={`/ops/clips/${clip.id}`}
                            className="rounded bg-muted px-2 py-1 text-xs hover:bg-accent transition-colors whitespace-nowrap">
                            Detail
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Audit trail */}
        {auditTrail.length > 0 && (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-5 py-3 border-b border-border">
              <h2 className="font-semibold text-sm">Letzte Aktivitäten</h2>
            </div>
            <div className="divide-y divide-border">
              {auditTrail.map((entry, i) => {
                let metaObj: Record<string, unknown> = {};
                try { metaObj = entry.meta ? JSON.parse(entry.meta) : {}; } catch { /* ignore */ }
                const metaKeys = Object.keys(metaObj).filter(k => metaObj[k] != null && metaObj[k] !== "");
                return (
                  <div key={i} className="flex items-start gap-3 px-5 py-3">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground mt-0.5">
                      {(entry.actor_name ?? "?").slice(0, 1).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm">
                        <span className="font-medium">{entry.actor_name ?? "Unbekannt"}</span>
                        {" · "}
                        <span className="text-muted-foreground">{entry.action ?? "Aktion"}</span>
                      </p>
                      {metaKeys.length > 0 && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {metaKeys.map(k => `${k}: ${metaObj[k]}`).join(" · ")}
                        </p>
                      )}
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground whitespace-nowrap">
                      {formatRelative(entry.created_at)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>
    </>
  );
}
