"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { CutterNav } from "@/components/cutter-nav";
import {
  ChevronLeft, RefreshCw, CheckCircle2, XCircle, Upload,
  Eye, ImageIcon, X, Globe, User, FileText, BarChart2,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────
interface Report {
  id: string; cutter_id: string; cutter_name: string | null; cutter_email: string | null;
  platform: string; month: string; status: string;
  total_views: number | null; total_clips: number | null;
  total_likes: number | null; total_comments: number | null; total_shares: number | null;
  avg_watch_time_sec: number | null; followers_start: number | null; followers_end: number | null;
  top_countries: { code: string; name: string; pct: number }[];
  top_cities: { name: string; pct: number }[];
  cutter_note: string | null; admin_review_note: string | null;
  reviewed_by_name: string | null; reviewed_at: string | null;
  submitted_at: string | null; created_at: string | null; updated_at: string | null;
}
interface Proof {
  id: string | null; signed_url: string | null; file_name: string | null;
  file_size: number | null; description: string | null; uploaded_at: string | null;
}

// ── Config ────────────────────────────────────────────────────────────────
const STATUS_CFG: Record<string, { label: string; badge: string }> = {
  draft:              { label: "Entwurf",      badge: "bg-muted/40 text-muted-foreground border-border" },
  submitted:          { label: "Eingereicht",  badge: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
  under_review:       { label: "In Prüfung",   badge: "bg-purple-500/10 text-purple-400 border-purple-500/20" },
  approved:           { label: "Genehmigt",    badge: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
  rejected:           { label: "Abgelehnt",    badge: "bg-red-500/15 text-red-400 border-red-500/25" },
  reupload_requested: { label: "Neu hochladen",badge: "bg-orange-500/10 text-orange-400 border-orange-500/20" },
};

const PLATFORMS: Record<string, string> = {
  youtube: "YouTube", tiktok: "TikTok", instagram: "Instagram", facebook: "Facebook",
};

const ACTION_CFG: { action: string; label: string; cls: string; icon: React.ElementType }[] = [
  { action: "start_review",     label: "Prüfung starten",     cls: "border-border text-muted-foreground hover:border-purple-500/50 hover:text-purple-400", icon: Eye },
  { action: "approve",          label: "Genehmigen",           cls: "border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10",                       icon: CheckCircle2 },
  { action: "request_reupload", label: "Neu hochladen anf.",   cls: "border-orange-500/30 text-orange-400 hover:bg-orange-500/10",                          icon: Upload },
  { action: "reject",           label: "Ablehnen",             cls: "border-red-500/30 text-red-400 hover:bg-red-500/10",                                   icon: XCircle },
];

const fmtNum = new Intl.NumberFormat("de-DE");
function fmtN(n: number | null) {
  if (n === null || n === undefined) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(".", ",")}M`;
  return fmtNum.format(n);
}
function fmtBytes(b: number | null) {
  if (!b) return "";
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}
function fmtDate(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("de-DE", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtMonth(ym: string | null) {
  if (!ym) return "—";
  const [y, m] = ym.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("de-DE", { month: "long", year: "numeric" });
}

// ── Page ──────────────────────────────────────────────────────────────────
export default function OpsInsightDetailPage() {
  const { id }   = useParams<{ id: string }>();
  const router   = useRouter();

  const [report,     setReport]     = useState<Report | null>(null);
  const [proofs,     setProofs]     = useState<Proof[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [err,        setErr]        = useState("");
  const [lightbox,   setLightbox]   = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [noteInput,  setNoteInput]  = useState("");
  const [actionMsg,  setActionMsg]  = useState("");

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    const res = await fetch(`/api/ops/insights/${id}`);
    if (!res.ok) { setErr("Bericht nicht gefunden."); setLoading(false); return; }
    const json = await res.json();
    setReport(json.report);
    setProofs(json.proofs ?? []);
    setNoteInput(json.report.admin_review_note ?? "");
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function doAction(action: string) {
    setActionBusy(action); setActionMsg("");
    const res = await fetch(`/api/ops/insights/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, note: noteInput || undefined }),
    });
    const json = await res.json();
    if (res.ok) { setActionMsg(`Status: ${json.status}`); await load(); }
    else        { setActionMsg(json.error ?? "Fehler"); }
    setActionBusy(null);
  }

  if (loading) return (
    <div className="min-h-screen bg-background"><CutterNav />
      <div className="flex items-center justify-center min-h-[60vh]">
        <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    </div>
  );

  if (err || !report) return (
    <div className="min-h-screen bg-background"><CutterNav />
      <div className="mx-auto max-w-4xl px-6 py-12 text-center text-muted-foreground">
        <p>{err || "Nicht gefunden."}</p>
        <button onClick={() => router.back()} className="mt-4 text-sm underline">Zurück</button>
      </div>
    </div>
  );

  const cfg         = STATUS_CFG[report.status] ?? STATUS_CFG.draft;
  const platLabel   = PLATFORMS[report.platform] ?? report.platform;
  const follGrowth  = report.followers_start && report.followers_end
    ? report.followers_end - report.followers_start : null;

  return (
    <div className="min-h-screen bg-background">
      <CutterNav />

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={() => setLightbox(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="Screenshot" className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain" />
          <button className="absolute top-4 right-4 text-white/70 hover:text-white">
            <X className="h-6 w-6" />
          </button>
        </div>
      )}

      <div className="mx-auto max-w-5xl px-4 sm:px-6 py-6 space-y-6">

        {/* Breadcrumb + Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <Link
              href="/ops/insights"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-3"
            >
              <ChevronLeft className="h-3 w-3" /> Alle Berichte
            </Link>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-semibold">
                {report.cutter_name ?? "—"} — {platLabel}
              </h1>
              <span className="text-sm text-muted-foreground">{fmtMonth(report.month)}</span>
              <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${cfg.badge}`}>
                {cfg.label}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">{report.cutter_email}</p>
          </div>
          <button
            onClick={load}
            className="shrink-0 flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <RefreshCw className="h-3 w-3" />
          </button>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Views",        value: fmtN(report.total_views) },
            { label: "Clips",        value: fmtN(report.total_clips) },
            { label: "Follower-Δ",   value: follGrowth !== null ? (follGrowth >= 0 ? "+" : "") + fmtN(follGrowth) : "—" },
            { label: "Ø Watch-Time", value: report.avg_watch_time_sec ? `${report.avg_watch_time_sec}s` : "—" },
            { label: "Likes",        value: fmtN(report.total_likes) },
            { label: "Kommentare",   value: fmtN(report.total_comments) },
            { label: "Shares",       value: fmtN(report.total_shares) },
            { label: "Screenshots",  value: String(proofs.length) },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-lg border border-border bg-card px-3 py-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">{label}</p>
              <p className="text-lg font-semibold tabular-nums">{value}</p>
            </div>
          ))}
        </div>

        {/* Screenshot gallery */}
        <div className="rounded-xl border border-border bg-card px-4 py-4">
          <div className="flex items-center gap-2 mb-3">
            <ImageIcon className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Screenshots ({proofs.length})</h2>
          </div>
          {proofs.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">Keine Screenshots hochgeladen.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {proofs.map(p => (
                <div
                  key={p.id}
                  className="relative group rounded-lg overflow-hidden border border-border bg-muted/20 aspect-video cursor-pointer"
                  onClick={() => p.signed_url && setLightbox(p.signed_url)}
                >
                  {p.signed_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.signed_url} alt={p.file_name ?? ""} className="w-full h-full object-cover" />
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <ImageIcon className="h-6 w-6 text-muted-foreground/40" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                    <Eye className="h-5 w-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 p-1.5 bg-gradient-to-t from-black/60 to-transparent">
                    <p className="text-[10px] text-white/80 truncate">{p.file_name ?? "Screenshot"}</p>
                    {p.file_size && <p className="text-[9px] text-white/50">{fmtBytes(p.file_size)}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Geo breakdown */}
        {report.top_countries.length > 0 && (
          <div className="rounded-xl border border-border bg-card px-4 py-4">
            <div className="flex items-center gap-2 mb-3">
              <Globe className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">Länder-Verteilung</h2>
            </div>
            <div className="space-y-2">
              {report.top_countries.map(c => (
                <div key={c.code} className="flex items-center gap-3">
                  <span className="w-8 text-xs text-muted-foreground uppercase font-mono">{c.code}</span>
                  <span className="w-28 text-xs truncate">{c.name}</span>
                  <div className="flex-1 h-1.5 rounded-full bg-muted/50 overflow-hidden">
                    <div className="h-full rounded-full bg-blue-500/60" style={{ width: `${c.pct}%` }} />
                  </div>
                  <span className="text-xs tabular-nums text-muted-foreground w-10 text-right">{c.pct.toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Cutter note */}
        {report.cutter_note && (
          <div className="rounded-xl border border-border bg-card px-4 py-4">
            <div className="flex items-center gap-2 mb-2">
              <User className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">Notiz vom Cutter</h2>
            </div>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{report.cutter_note}</p>
          </div>
        )}

        {/* Admin review panel */}
        <div className="rounded-xl border border-border bg-card px-4 py-4">
          <div className="flex items-center gap-2 mb-4">
            <BarChart2 className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Admin-Prüfung</h2>
          </div>

          <div className="mb-4">
            <label className="text-[11px] text-muted-foreground uppercase tracking-widest block mb-1.5">
              Interne Notiz / Begründung
            </label>
            <textarea
              value={noteInput}
              onChange={e => setNoteInput(e.target.value)}
              rows={2}
              placeholder="Notiz zur Entscheidung (wird dem Cutter angezeigt)…"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/50"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {ACTION_CFG.map(({ action, label, cls, icon: Icon }) => (
              <button
                key={action}
                onClick={() => doAction(action)}
                disabled={!!actionBusy}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${cls}`}
              >
                {actionBusy === action
                  ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  : <Icon className="h-3.5 w-3.5" />}
                {label}
              </button>
            ))}
          </div>

          {actionMsg && (
            <p className="mt-3 text-xs text-muted-foreground">{actionMsg}</p>
          )}

          {/* Previous review */}
          {report.reviewed_by_name && (
            <div className="mt-4 pt-3 border-t border-border/50 text-[11px] text-muted-foreground space-y-0.5">
              <p><span className="text-foreground/60">Geprüft von:</span> {report.reviewed_by_name}</p>
              <p><span className="text-foreground/60">Am:</span> {fmtDate(report.reviewed_at)}</p>
              {report.admin_review_note && (
                <p><span className="text-foreground/60">Notiz:</span> {report.admin_review_note}</p>
              )}
            </div>
          )}
        </div>

        {/* Meta */}
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-[11px] text-muted-foreground pb-6">
          <span>Erstellt: {fmtDate(report.created_at)}</span>
          <span>Eingereicht: {fmtDate(report.submitted_at)}</span>
          <span>Aktualisiert: {fmtDate(report.updated_at)}</span>
          <span className="font-mono opacity-40">ID: {report.id}</span>
        </div>

      </div>
    </div>
  );
}
