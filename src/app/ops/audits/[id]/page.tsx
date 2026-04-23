"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { CutterNav } from "@/components/cutter-nav";
import {
  ChevronLeft, RefreshCw, CheckCircle2, AlertTriangle, XCircle,
  FileText, Shield, Globe, BarChart2, Clock, User, ExternalLink,
  ChevronRight,
} from "lucide-react";
import {
  RISK_CFG, AUDIT_STATUS_CFG, DATA_SOURCE_CFG,
  PLATFORM_LABELS, riskLevel, FLAG_LABELS,
  calcEngagementRate,
  type AuditStatus, type DataSource,
} from "@/lib/audit-risk";

// ── Types ─────────────────────────────────────────────────────────────────
interface GeoEntry { code: string; name: string; pct: number; views?: number; }
interface ProofFile {
  id: string | null;
  file_url: string | null;
  file_name: string | null;
  file_size: number | null;
  mime_type: string | null;
  description: string | null;
  uploaded_at: string | null;
}
interface Audit {
  id: string;
  cutter_id: string | null;
  cutter_name: string | null;
  cutter_email: string | null;
  platform: string | null;
  month: string | null;
  total_views: number;
  total_clips: number;
  total_likes: number | null;
  total_comments: number | null;
  total_shares: number | null;
  avg_watch_time_sec: number | null;
  followers_start: number | null;
  followers_end: number | null;
  top_countries: GeoEntry[];
  top_cities: { name: string; pct: number }[];
  data_source: string;
  cutter_notes: string | null;
  fraud_risk_score: number;
  geo_risk: number;
  engagement_risk: number;
  spike_risk: number;
  data_quality_risk: number;
  risk_flags: string[];
  audit_status: string;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  submitted_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

// ── Number formatter ──────────────────────────────────────────────────────
const fmt = new Intl.NumberFormat("de-DE");
function fmtN(n: number | null): string {
  if (n === null || n === undefined) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(".", ",")}M`;
  return fmt.format(n);
}
function fmtBytes(b: number | null): string {
  if (!b) return "";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}
function fmtDate(s: string | null): string {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("de-DE", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtMonth(ym: string | null): string {
  if (!ym) return "—";
  const [y, m] = ym.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("de-DE", { month: "long", year: "numeric" });
}

// ── Score bar ─────────────────────────────────────────────────────────────
function ScoreBar({ value, max, colorClass }: { value: number; max: number; colorClass: string }) {
  const pct = Math.round((value / max) * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-muted/50 overflow-hidden">
        <div className={`h-full rounded-full transition-all ${colorClass}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs tabular-nums text-muted-foreground w-8 text-right">{value}/{max}</span>
    </div>
  );
}

// ── Risk gauge ────────────────────────────────────────────────────────────
function RiskGauge({ score }: { score: number }) {
  const level = riskLevel(score);
  const cfg   = RISK_CFG[level];
  return (
    <div className="flex flex-col items-center gap-1">
      <div className={`text-3xl font-bold tabular-nums ${cfg.text}`}>{score}</div>
      <div className={`text-[10px] font-semibold uppercase tracking-widest px-2 py-0.5 rounded-full border ${cfg.badge}`}>
        {level === "low" ? "Niedrig" : level === "medium" ? "Mittel" : level === "high" ? "Hoch" : "Kritisch"}
      </div>
      <div className="text-[10px] text-muted-foreground">von 100</div>
    </div>
  );
}

// ── Action button map ─────────────────────────────────────────────────────
const ACTION_CFG: Record<string, { label: string; icon: React.ElementType; cls: string }> = {
  start_review:  { label: "Prüfung starten",    icon: Clock,         cls: "border-border text-muted-foreground hover:border-purple-500/50 hover:text-purple-400" },
  approve:       { label: "Genehmigen",          icon: CheckCircle2,  cls: "border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10" },
  request_proof: { label: "Nachweis anfordern",  icon: FileText,      cls: "border-orange-500/30 text-orange-400 hover:bg-orange-500/10" },
  flag:          { label: "Verdächtig markieren",icon: AlertTriangle, cls: "border-red-500/30 text-red-400 hover:bg-red-500/10" },
  reject:        { label: "Ablehnen",            icon: XCircle,       cls: "border-red-600/30 text-red-500 hover:bg-red-500/10" },
};

// ── Page ──────────────────────────────────────────────────────────────────
export default function AuditDetailPage() {
  const { id }   = useParams<{ id: string }>();
  const router   = useRouter();

  const [audit,   setAudit]   = useState<Audit | null>(null);
  const [files,   setFiles]   = useState<ProofFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [err,     setErr]     = useState("");

  // Admin actions
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [noteInput,  setNoteInput]  = useState("");
  const [actionMsg,  setActionMsg]  = useState("");

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    const res = await fetch(`/api/ops/audits/${id}`);
    if (!res.ok) { setErr("Audit nicht gefunden."); setLoading(false); return; }
    const json = await res.json();
    setAudit(json.audit);
    setFiles(json.files ?? []);
    setNoteInput(json.audit.review_notes ?? "");
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function doAction(action: string) {
    if (!audit) return;
    setActionBusy(action); setActionMsg("");
    const res = await fetch(`/api/ops/audits/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, note: noteInput || undefined }),
    });
    const json = await res.json();
    if (res.ok) {
      setActionMsg(`Status auf "${json.audit_status}" gesetzt.`);
      await load();
    } else {
      setActionMsg(json.error ?? "Fehler");
    }
    setActionBusy(null);
  }

  if (loading) return (
    <div className="min-h-screen bg-background">
      <CutterNav />
      <div className="flex items-center justify-center min-h-[60vh]">
        <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    </div>
  );

  if (err || !audit) return (
    <div className="min-h-screen bg-background">
      <CutterNav />
      <div className="mx-auto max-w-5xl px-6 py-12 text-center text-muted-foreground">
        <p>{err || "Audit nicht gefunden."}</p>
        <button onClick={() => router.back()} className="mt-4 text-sm underline">Zurück</button>
      </div>
    </div>
  );

  const level      = riskLevel(audit.fraud_risk_score);
  const riskCfg    = RISK_CFG[level];
  const statusCfg  = AUDIT_STATUS_CFG[audit.audit_status as AuditStatus] ?? { label: audit.audit_status, badge: "bg-muted/30 text-muted-foreground border-border" };
  const sourceCfg  = DATA_SOURCE_CFG[audit.data_source as DataSource] ?? { label: audit.data_source, badge: "bg-muted/30 text-muted-foreground border-border" };
  const platLabel  = PLATFORM_LABELS[audit.platform ?? ""] ?? audit.platform ?? "—";
  const engRate    = calcEngagementRate(audit.total_views, audit.total_likes, audit.total_comments, audit.total_shares);
  const follGrowth = audit.followers_start && audit.followers_end
    ? audit.followers_end - audit.followers_start
    : null;

  return (
    <div className="min-h-screen bg-background">
      <CutterNav />

      <div className="mx-auto max-w-5xl px-4 sm:px-6 py-6 space-y-6">

        {/* ── Breadcrumb / Header ──────────────────────────────── */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <Link
              href="/ops/audits"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-3"
            >
              <ChevronLeft className="h-3 w-3" /> Alle Audits
            </Link>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-semibold">
                {audit.cutter_name ?? "—"} — {platLabel}
              </h1>
              <span className="text-sm text-muted-foreground">{fmtMonth(audit.month)}</span>
              <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium ${statusCfg.badge}`}>
                {statusCfg.label}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{audit.cutter_email}</p>
          </div>
          <button
            onClick={load}
            className="shrink-0 flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:border-border/80 transition-colors"
          >
            <RefreshCw className="h-3 w-3" /> Aktualisieren
          </button>
        </div>

        {/* ── Top grid: Metrics + Risk gauge ───────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

          {/* Metrics */}
          <div className="md:col-span-2 grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Views",       value: fmtN(audit.total_views) },
              { label: "Clips",       value: fmtN(audit.total_clips) },
              { label: "Engagement",  value: engRate !== null ? `${engRate.toFixed(2).replace(".", ",")}%` : "—" },
              { label: "Follower-Δ",  value: follGrowth !== null ? (follGrowth >= 0 ? "+" : "") + fmtN(follGrowth) : "—" },
              { label: "Likes",       value: fmtN(audit.total_likes) },
              { label: "Kommentare",  value: fmtN(audit.total_comments) },
              { label: "Shares",      value: fmtN(audit.total_shares) },
              { label: "Ø Watch-Time",value: audit.avg_watch_time_sec ? `${audit.avg_watch_time_sec}s` : "—" },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-lg border border-border bg-card px-3 py-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">{label}</p>
                <p className="text-lg font-semibold tabular-nums">{value}</p>
              </div>
            ))}
          </div>

          {/* Risk gauge */}
          <div className="rounded-lg border border-border bg-card px-4 py-4 flex flex-col items-center justify-center gap-4">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Shield className="h-3.5 w-3.5" /> Risiko-Score
            </div>
            <RiskGauge score={audit.fraud_risk_score} />
            <div className="w-full space-y-2 text-[11px]">
              <div>
                <div className="flex justify-between text-muted-foreground mb-0.5"><span>Geo</span><span>{audit.geo_risk}/30</span></div>
                <ScoreBar value={audit.geo_risk} max={30} colorClass={audit.geo_risk >= 20 ? "bg-red-500" : audit.geo_risk >= 12 ? "bg-orange-400" : "bg-yellow-400"} />
              </div>
              <div>
                <div className="flex justify-between text-muted-foreground mb-0.5"><span>Engagement</span><span>{audit.engagement_risk}/30</span></div>
                <ScoreBar value={audit.engagement_risk} max={30} colorClass={audit.engagement_risk >= 20 ? "bg-red-500" : audit.engagement_risk >= 12 ? "bg-orange-400" : "bg-yellow-400"} />
              </div>
              <div>
                <div className="flex justify-between text-muted-foreground mb-0.5"><span>Spike</span><span>{audit.spike_risk}/20</span></div>
                <ScoreBar value={audit.spike_risk} max={20} colorClass={audit.spike_risk >= 15 ? "bg-red-500" : audit.spike_risk >= 8 ? "bg-orange-400" : "bg-yellow-400"} />
              </div>
              <div>
                <div className="flex justify-between text-muted-foreground mb-0.5"><span>Datenqualität</span><span>{audit.data_quality_risk}/20</span></div>
                <ScoreBar value={audit.data_quality_risk} max={20} colorClass={audit.data_quality_risk >= 15 ? "bg-red-500" : audit.data_quality_risk >= 8 ? "bg-orange-400" : "bg-yellow-400"} />
              </div>
            </div>
            <span className={`text-[10px] border rounded px-1.5 py-0.5 ${sourceCfg.badge}`}>{sourceCfg.label}</span>
          </div>
        </div>

        {/* ── Risk flags ───────────────────────────────────────── */}
        {audit.risk_flags.length > 0 && (
          <div className="rounded-lg border border-border bg-card px-4 py-4">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className={`h-4 w-4 ${riskCfg.text}`} />
              <h2 className="text-sm font-semibold">Risiko-Flags</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              {audit.risk_flags.map(flag => (
                <span key={flag} className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs ${riskCfg.badge}`}>
                  {FLAG_LABELS[flag] ?? flag}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* ── Geo breakdown ────────────────────────────────────── */}
        {audit.top_countries.length > 0 && (
          <div className="rounded-lg border border-border bg-card px-4 py-4">
            <div className="flex items-center gap-2 mb-3">
              <Globe className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">Geo-Verteilung (Top-Länder)</h2>
            </div>
            <div className="space-y-2">
              {audit.top_countries.map(c => (
                <div key={c.code} className="flex items-center gap-3">
                  <span className="w-8 text-xs text-muted-foreground uppercase font-mono">{c.code}</span>
                  <span className="w-28 text-xs truncate">{c.name}</span>
                  <div className="flex-1 h-1.5 rounded-full bg-muted/50 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-blue-500/60"
                      style={{ width: `${c.pct}%` }}
                    />
                  </div>
                  <span className="text-xs tabular-nums text-muted-foreground w-10 text-right">{c.pct.toFixed(1)}%</span>
                  {c.views && (
                    <span className="text-xs tabular-nums text-muted-foreground w-16 text-right">{fmtN(c.views)}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Proof files ──────────────────────────────────────── */}
        <div className="rounded-lg border border-border bg-card px-4 py-4">
          <div className="flex items-center gap-2 mb-3">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Nachweise ({files.length})</h2>
          </div>
          {files.length === 0 ? (
            <p className="text-xs text-muted-foreground">Keine Dateien hochgeladen.</p>
          ) : (
            <div className="space-y-2">
              {files.map(f => (
                <div key={f.id} className="flex items-center gap-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5">
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{f.file_name ?? "Unbenannt"}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {fmtBytes(f.file_size)}{f.description ? ` — ${f.description}` : ""}
                      {f.uploaded_at ? ` · ${fmtDate(f.uploaded_at)}` : ""}
                    </p>
                  </div>
                  {f.file_url && (
                    <a
                      href={f.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
                    >
                      <ExternalLink className="h-3 w-3" /> Öffnen
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Cutter notes ─────────────────────────────────────── */}
        {audit.cutter_notes && (
          <div className="rounded-lg border border-border bg-card px-4 py-4">
            <div className="flex items-center gap-2 mb-2">
              <User className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">Cutter-Notizen</h2>
            </div>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{audit.cutter_notes}</p>
          </div>
        )}

        {/* ── Admin actions ─────────────────────────────────────── */}
        <div className="rounded-lg border border-border bg-card px-4 py-4">
          <div className="flex items-center gap-2 mb-4">
            <BarChart2 className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Admin-Aktionen</h2>
          </div>

          {/* Review note */}
          <div className="mb-4">
            <label className="text-[11px] text-muted-foreground uppercase tracking-widest block mb-1.5">Notiz (optional)</label>
            <textarea
              value={noteInput}
              onChange={e => setNoteInput(e.target.value)}
              rows={2}
              placeholder="Notiz zur Entscheidung…"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/50"
            />
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2">
            {Object.entries(ACTION_CFG).map(([action, cfg]) => {
              const Icon = cfg.icon;
              const busy = actionBusy === action;
              return (
                <button
                  key={action}
                  onClick={() => doAction(action)}
                  disabled={!!actionBusy}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${cfg.cls}`}
                >
                  {busy
                    ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    : <Icon className="h-3.5 w-3.5" />}
                  {cfg.label}
                </button>
              );
            })}
          </div>

          {actionMsg && (
            <p className="mt-3 text-xs text-muted-foreground">{actionMsg}</p>
          )}

          {/* Current review info */}
          {audit.reviewed_by_name && (
            <div className="mt-4 pt-3 border-t border-border/50 text-[11px] text-muted-foreground space-y-0.5">
              <p><span className="text-foreground/60">Geprüft von:</span> {audit.reviewed_by_name}</p>
              <p><span className="text-foreground/60">Am:</span> {fmtDate(audit.reviewed_at)}</p>
              {audit.review_notes && (
                <p><span className="text-foreground/60">Notiz:</span> {audit.review_notes}</p>
              )}
            </div>
          )}
        </div>

        {/* ── Meta / timestamps ─────────────────────────────────── */}
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-[11px] text-muted-foreground pb-6">
          <span>Erstellt: {fmtDate(audit.created_at)}</span>
          <span>Aktualisiert: {fmtDate(audit.updated_at)}</span>
          {audit.submitted_at && <span>Eingereicht: {fmtDate(audit.submitted_at)}</span>}
          <span className="font-mono opacity-50">ID: {audit.id}</span>
        </div>

      </div>
    </div>
  );
}
