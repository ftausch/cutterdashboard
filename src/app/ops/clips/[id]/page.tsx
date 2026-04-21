"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { CutterNav } from "@/components/cutter-nav";
import { ClipNotesPanel } from "@/components/clip-notes-panel";
import { ClipAttributesPanel } from "@/components/clip-attributes-panel";
import {
  ArrowLeft, Flag, FlagOff, CheckCircle2, ShieldCheck,
  FileText, RefreshCw, ExternalLink, X, ZoomIn,
} from "lucide-react";
import { describeAuditEntry, auditDotClass } from "@/lib/audit-describe";

interface ProofFile {
  id: string | null;
  file_url: string | null;
  file_name: string | null;
  file_size: number | null;
  mime_type: string | null;
  uploaded_at: string | null;
  proof_status: string | null;
  uploader_note: string | null;
  reviewed_by_id: string | null;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  review_note: string | null;
}

interface VideoDetail {
  id: string;
  cutter_id: string;
  platform: string | null;
  external_id: string | null;
  url: string | null;
  title: string | null;
  account_handle: string | null;
  current_views: number | null;
  views_at_last_invoice: number | null;
  claimed_views: number | null;
  observed_views: number | null;
  api_views: number | null;
  verification_status: string | null;
  verification_source: string | null;
  confidence_level: number | null;
  discrepancy_status: string | null;
  discrepancy_percent: number | null;
  is_flagged: number | null;
  flag_reason: string | null;
  proof_url: string | null;
  proof_status: string | null;
  proof_cutter_note: string | null;
  proof_rejection_reason: string | null;
  proof_reviewer_id: string | null;
  proof_reviewer_name: string | null;
  proof_reviewed_at: string | null;
  proof_uploaded_at: string | null;
  proof_requested_at: string | null;
  proof_requested_by: string | null;
  episode_id: string | null;
  published_at: string | null;
  last_scraped_at: string | null;
  created_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
}

interface Cutter { id: string | null; name: string | null; email: string | null; rate_per_view: number | null; }
interface Episode { id: string | null; title: string | null; }
interface Snapshot {
  id: string | null; views: number | null; observed_views: number | null;
  api_views: number | null; claimed_views: number | null;
  verification_source: string | null; confidence_level: number | null;
  snapshot_type: string | null; success: number | null;
  error_message: string | null; scraped_at: string | null;
}
interface AuditEntry {
  id: string | null; actor_id: string | null; actor_name: string | null;
  action: string | null; entity_type: string | null; entity_id: string | null;
  meta: string | null; created_at: string | null;
}

interface ClipDetailResponse {
  video: VideoDetail;
  cutter: Cutter | null;
  episode: Episode | null;
  snapshots: Snapshot[];
  auditTrail: AuditEntry[];
  proofFile: ProofFile | null;
}

const PLATFORM_LABELS: Record<string, string> = {
  youtube: "YouTube", tiktok: "TikTok", instagram: "Instagram", facebook: "Facebook",
};

const DISC_CONFIG: Record<string, { label: string; cls: string }> = {
  match:                 { label: "Übereinstimmung",     cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
  minor_difference:      { label: "Geringe Differenz",   cls: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20" },
  suspicious_difference: { label: "Verdächtige Differenz", cls: "bg-orange-500/10 text-orange-400 border-orange-500/20" },
  critical_difference:   { label: "Kritische Differenz", cls: "bg-red-500/10 text-red-400 border-red-500/20" },
  no_data:               { label: "Keine Daten",         cls: "bg-muted/50 text-muted-foreground border-border" },
};

const PROOF_STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  proof_submitted:          { label: "⏳ Zur Prüfung",       cls: "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20" },
  proof_under_review:       { label: "🔍 In Prüfung",        cls: "bg-purple-500/10 text-purple-400 border border-purple-500/20" },
  proof_approved:           { label: "✓ Genehmigt",          cls: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" },
  proof_rejected:           { label: "✕ Abgelehnt",          cls: "bg-red-500/10 text-red-400 border border-red-500/20" },
  proof_requested:          { label: "⚠ Angefordert",        cls: "bg-orange-500/10 text-orange-400 border border-orange-500/20" },
  proof_reupload_requested: { label: "↩ Neu einreichen",     cls: "bg-orange-500/10 text-orange-400 border border-orange-500/20" },
  no_proof_needed:          { label: "—",                    cls: "bg-muted/50 text-muted-foreground border-border" },
};


function formatNum(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
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
    hour: "2-digit", minute: "2-digit",
  });
}

function formatBytes(n: number | null): string {
  if (n == null) return "";
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${n} B`;
}

// ── Per-proof status config ────────────────────────────────────────
const FILE_STATUS_CFG: Record<string, { label: string; cls: string }> = {
  uploaded:     { label: "Neu",         cls: "bg-blue-500/10 text-blue-400 border border-blue-500/20" },
  under_review: { label: "In Prüfung", cls: "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20" },
  approved:     { label: "✓ Genehmigt", cls: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" },
  rejected:     { label: "✕ Abgelehnt", cls: "bg-red-500/10 text-red-400 border border-red-500/20" },
};

// ── Single Proof Viewer with admin review actions ─────────────────
function ProofViewer({
  file,
  proofUrl,
  clipId,
  onReviewed,
}: {
  file: ProofFile | null;
  proofUrl: string | null;
  clipId: string;
  onReviewed: () => void;
}) {
  const [showLightbox,    setShowLightbox]    = useState(false);
  const [rejectInput,     setRejectInput]     = useState("");
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [actionLoading,   setActionLoading]   = useState<string | null>(null);

  // Use file record if available, fall back to legacy proof_url
  const displayUrl  = file?.file_url ?? proofUrl;
  const isPdf       = file?.mime_type === "application/pdf";
  const fileCfg     = file?.proof_status ? (FILE_STATUS_CFG[file.proof_status] ?? null) : null;
  const isApproved  = file?.proof_status === "approved";

  if (!displayUrl) return null;

  async function doAction(action: "approve" | "reject" | "reset", note?: string) {
    if (!file?.id) return;
    setActionLoading(action);
    await fetch(`/api/ops/clips/${clipId}/proof/${file.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, review_note: note ?? null }),
    });
    setActionLoading(null);
    setShowRejectInput(false);
    setRejectInput("");
    onReviewed();
  }

  return (
    <>
      {/* ── Lightbox ────────────────────────────────────────── */}
      {showLightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm"
          onClick={() => setShowLightbox(false)}
        >
          <div className="relative max-w-4xl w-full" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setShowLightbox(false)}
              className="absolute -top-10 right-0 rounded-full bg-white/10 p-2 text-white hover:bg-white/20 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
            <img
              src={displayUrl}
              alt="Beleg"
              className="max-w-full max-h-[85vh] rounded-xl object-contain mx-auto block"
            />
          </div>
        </div>
      )}

      {/* ── Proof image ─────────────────────────────────────── */}
      {isPdf ? (
        <div className="flex h-40 items-center justify-center gap-2 rounded-xl border border-border bg-muted/20 text-sm text-muted-foreground">
          <FileText className="h-6 w-6" />
          <a href={displayUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
            PDF öffnen
          </a>
        </div>
      ) : (
        <div
          className={`group relative cursor-pointer overflow-hidden rounded-xl border transition-all hover:border-primary/40 ${
            isApproved ? "border-emerald-500/40" :
            file?.proof_status === "rejected" ? "border-red-500/40" :
            "border-border"
          }`}
          onClick={() => setShowLightbox(true)}
        >
          <img
            src={displayUrl}
            alt="Beleg"
            className="w-full object-contain bg-muted/20"
            style={{ maxHeight: "70vh", minHeight: "240px" }}
            onError={e => { (e.target as HTMLImageElement).style.opacity = "0.3"; }}
          />
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30">
            <div className="flex items-center gap-2 rounded-full bg-black/60 px-4 py-2 text-white text-sm font-medium backdrop-blur-sm">
              <ZoomIn className="h-4 w-4" />
              Vergrößern
            </div>
          </div>
          {fileCfg && (
            <div className={`absolute top-2 left-2 rounded px-2 py-0.5 text-xs font-medium backdrop-blur-sm ${fileCfg.cls}`}>
              {fileCfg.label}
            </div>
          )}
        </div>
      )}

      {/* ── File metadata ────────────────────────────────────── */}
      {file && (
        <div className="space-y-2 text-xs text-muted-foreground">
          <div className="flex items-center justify-between flex-wrap gap-1">
            <span>{file.file_name ?? "Screenshot"}</span>
            <span>
              {file.file_size ? formatBytes(file.file_size) + " · " : ""}
              {file.uploaded_at ? formatDateTime(file.uploaded_at) : ""}
            </span>
          </div>

          {/* Uploader note */}
          {file.uploader_note && (
            <div className="rounded-lg bg-muted/40 px-3 py-2">
              <p className="font-medium text-foreground/70 mb-0.5">Notiz vom Cutter</p>
              <p className="text-foreground/90">{file.uploader_note}</p>
            </div>
          )}

          {/* Previous review info */}
          {file.reviewed_by_name && (
            <div className={`rounded-lg px-3 py-2 ${isApproved ? "bg-emerald-500/10 border border-emerald-500/20" : "bg-red-500/10 border border-red-500/20"}`}>
              <p className={`font-medium ${isApproved ? "text-emerald-400" : "text-red-400"}`}>
                {isApproved ? "✓ Genehmigt" : "✕ Abgelehnt"} von {file.reviewed_by_name}
                {file.reviewed_at && ` · ${formatDateTime(file.reviewed_at)}`}
              </p>
              {file.review_note && (
                <p className="text-foreground/70 mt-0.5">{file.review_note}</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Review actions (only for files with IDs) ─────────── */}
      {file?.id && (
        <div className="space-y-2 border-t border-border pt-3">
          <p className="text-xs font-medium text-muted-foreground">Nachweis prüfen:</p>

          {showRejectInput && (
            <div className="flex gap-2">
              <input
                value={rejectInput}
                onChange={e => setRejectInput(e.target.value)}
                placeholder="Ablehnungsgrund…"
                className="h-9 flex-1 rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-primary"
              />
              <button
                onClick={() => doAction("reject", rejectInput)}
                disabled={!rejectInput.trim() || actionLoading !== null}
                className="h-9 rounded-lg bg-red-500/10 px-4 text-sm text-red-400 hover:bg-red-500/20 disabled:opacity-50 transition-colors"
              >
                {actionLoading === "reject" ? <RefreshCw className="h-4 w-4 animate-spin" /> : "Ablehnen"}
              </button>
            </div>
          )}

          <div className="flex gap-2">
            {!isApproved && (
              <button
                onClick={() => doAction("approve")}
                disabled={actionLoading !== null}
                className="flex-1 rounded-lg bg-emerald-500/10 py-2 text-sm font-medium text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-50 transition-colors"
              >
                {actionLoading === "approve" ? <RefreshCw className="h-4 w-4 animate-spin mx-auto" /> : "✓ Genehmigen"}
              </button>
            )}
            {!isApproved && (
              <button
                onClick={() => setShowRejectInput(v => !v)}
                disabled={actionLoading !== null}
                className="flex-1 rounded-lg bg-red-500/10 py-2 text-sm font-medium text-red-400 hover:bg-red-500/20 disabled:opacity-50 transition-colors"
              >
                ✕ Ablehnen
              </button>
            )}
            {(file.proof_status !== "uploaded" || isApproved) && (
              <button
                onClick={() => doAction("reset")}
                disabled={actionLoading !== null}
                className="rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground hover:bg-accent disabled:opacity-50 transition-colors"
                title="Prüfung zurücksetzen"
              >
                ↺ Reset
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// ── Internal Review Note ──────────────────────────────────────────
function InternalNoteField({
  videoId, currentNote, onSaved,
}: { videoId: string; currentNote: string | null; onSaved: () => void }) {
  const [note,    setNote]    = useState(currentNote ?? "");
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);

  async function save() {
    setSaving(true);
    await fetch(`/api/ops/clips/${videoId}/actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "add_note", note }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
    onSaved();
  }

  return (
    <div className="border-t border-border pt-4 space-y-2">
      <p className="text-xs font-medium text-muted-foreground">Interne Notiz (nur für Ops)</p>
      <textarea
        value={note}
        onChange={e => setNote(e.target.value)}
        placeholder="Interne Anmerkungen zum Nachweis…"
        rows={2}
        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary resize-none"
      />
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground/50">Nicht für den Cutter sichtbar</span>
        <button
          onClick={save}
          disabled={saving}
          className="rounded-lg bg-muted px-3 py-1 text-xs text-foreground hover:bg-accent disabled:opacity-50 transition-colors"
        >
          {saving ? "Speichert…" : saved ? "✓ Gespeichert" : "Speichern"}
        </button>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────
export default function ClipDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [data, setData] = useState<ClipDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [flagReason, setFlagReason] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [showFlagInput, setShowFlagInput] = useState(false);
  const [showRejectInput, setShowRejectInput] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/ops/clips/${id}`);
    if (res.status === 401) { router.push("/login"); return; }
    if (res.status === 403) { router.push("/dashboard"); return; }
    if (res.status === 404) { router.push("/ops/clips"); return; }
    const json = await res.json();
    setData(json);
    setLoading(false);
  }, [id, router]);

  useEffect(() => { load(); }, [load]);

  async function doAction(action: string, extra: Record<string, unknown> = {}) {
    setActionLoading(action);
    await fetch(`/api/ops/clips/${id}/actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...extra }),
    });
    await load();
    setActionLoading(null);
    setShowRejectInput(false);
    setRejectReason("");
  }

  if (loading) {
    return (
      <>
        <CutterNav />
        <main className="mx-auto max-w-4xl px-6 py-8">
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            <RefreshCw className="h-5 w-5 animate-spin mr-2" />
            Lade Clip-Details…
          </div>
        </main>
      </>
    );
  }

  if (!data) return null;

  const { video, cutter, episode, snapshots, auditTrail, proofFile } = data;
  const discCfg = DISC_CONFIG[video.discrepancy_status ?? ""] ?? DISC_CONFIG.no_data;
  const isFlagged = !!video.is_flagged;
  const confidencePct = video.confidence_level ?? 0;

  const proofStatus    = video.proof_status;
  const proofStatusCfg = proofStatus ? (PROOF_STATUS_CONFIG[proofStatus] ?? PROOF_STATUS_CONFIG.no_proof_needed) : null;
  const canApproveReject  = proofStatus === "proof_submitted" || proofStatus === "proof_under_review";
  const canStartReview    = proofStatus === "proof_submitted";
  const canRequestReupload = !!proofFile && proofStatus !== "proof_approved";
  const proofTimeline = auditTrail.filter(e =>
    e.action?.includes("proof") || e.action?.includes("proof_file")
  );

  return (
    <>
      <CutterNav />
      <main className="mx-auto max-w-4xl px-6 py-8 space-y-6">

        {/* Back */}
        <Link
          href="/ops/clips"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Zurück zu Clips
        </Link>

        {/* Header card */}
        <div className="rounded-xl border border-border bg-card p-5 space-y-3">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-2">
                <span className="rounded bg-muted px-2 py-0.5 text-xs font-medium">
                  {PLATFORM_LABELS[video.platform ?? ""] ?? video.platform ?? "Unbekannt"}
                </span>
                {isFlagged && (
                  <span className="flex items-center gap-1 rounded bg-red-500/10 px-2 py-0.5 text-xs text-red-400">
                    <Flag className="h-3 w-3" /> Geflaggt
                  </span>
                )}
                {proofStatusCfg && proofStatus !== "no_proof_needed" && (
                  <span className={`rounded px-2 py-0.5 text-xs font-medium ${proofStatusCfg.cls}`}>
                    {proofStatusCfg.label}
                  </span>
                )}
              </div>
              <h1 className="text-lg font-bold leading-tight">{video.title ?? "Kein Titel"}</h1>
              {video.url && (
                <a
                  href={video.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary mt-1"
                >
                  {video.url.length > 60 ? video.url.slice(0, 60) + "…" : video.url}
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
            <div className="text-right shrink-0 text-xs text-muted-foreground space-y-1">
              {video.published_at && <p>Veröffentlicht: {formatDateTime(video.published_at)}</p>}
              {video.last_scraped_at && <p>Letzter Sync: {formatRelative(video.last_scraped_at)}</p>}
            </div>
          </div>

          <div className="flex items-center gap-4 text-sm flex-wrap">
            <span className="text-muted-foreground">
              Cutter:{" "}
              <Link href={`/ops/clips?cutter=${video.cutter_id}`} className="font-medium text-foreground hover:text-primary">
                {cutter?.name ?? "—"}
              </Link>
            </span>
            {episode && (
              <span className="text-muted-foreground">
                Episode: <span className="font-medium text-foreground">{episode.title}</span>
              </span>
            )}
            {video.account_handle && (
              <span className="text-muted-foreground">
                Handle: <span className="font-medium text-foreground">{video.account_handle}</span>
              </span>
            )}
          </div>

          {isFlagged && video.flag_reason && (
            <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-400">
              Flag-Grund: {video.flag_reason}
            </div>
          )}
        </div>

        {/* View comparison */}
        <div className="grid grid-cols-3 gap-4">
          <ViewCard label="Angegeben" value={formatNum(video.claimed_views)} border="border-orange-500/40" source="Cutter-Angabe" />
          <ViewCard
            label="Beobachtet"
            value={formatNum(video.observed_views ?? video.current_views)}
            border="border-blue-500/40"
            source="Scraper"
          />
          <ViewCard label="API-Verifiziert" value={formatNum(video.api_views)} border="border-emerald-500/40" source="Plattform-API" />
        </div>

        {/* Confidence meter */}
        <div className="rounded-xl border border-border bg-card p-5 space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">Konfidenz</span>
            <span className="text-muted-foreground">
              {confidencePct}/100 · {video.verification_source ?? "—"}
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                confidencePct >= 80 ? "bg-emerald-500" :
                confidencePct >= 50 ? "bg-yellow-500" :
                "bg-red-500"
              }`}
              style={{ width: `${confidencePct}%` }}
            />
          </div>
        </div>

        {/* Discrepancy badge */}
        <div className={`rounded-xl border px-5 py-4 flex items-center justify-between ${discCfg.cls}`}>
          <div>
            <p className="text-xs font-medium opacity-70 mb-0.5">Diskrepanz-Status</p>
            <p className="text-lg font-bold">{discCfg.label}</p>
          </div>
          {video.discrepancy_percent != null && (
            <p className="text-3xl font-bold font-mono">
              {video.discrepancy_percent > 0 ? "+" : ""}
              {video.discrepancy_percent.toFixed(1)}%
            </p>
          )}
        </div>

        {/* ── Proof Section ──────────────────────────────────────── */}
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-sm">Nachweis / Screenshots</h2>
            {proofStatusCfg && proofStatus !== "no_proof_needed" && (
              <span className={`rounded px-2 py-0.5 text-xs font-medium ${proofStatusCfg.cls}`}>
                {proofStatusCfg.label}
              </span>
            )}
          </div>

          {/* Proof viewer */}
          {(proofFile || video.proof_url) ? (
            <ProofViewer file={proofFile} proofUrl={video.proof_url} clipId={id} onReviewed={load} />
          ) : (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Noch kein Screenshot hochgeladen.
            </p>
          )}

          {/* Cutter note */}
          {video.proof_cutter_note && (
            <div className="rounded-lg border border-border bg-muted/30 px-4 py-3">
              <p className="text-xs text-muted-foreground mb-1 font-medium">Notiz vom Cutter</p>
              <p className="text-sm">{video.proof_cutter_note}</p>
            </div>
          )}

          {/* Rejection / reupload reason */}
          {(proofStatus === "proof_rejected" || proofStatus === "proof_reupload_requested") && video.proof_rejection_reason && (
            <div className={`rounded-lg border px-4 py-3 ${proofStatus === "proof_reupload_requested" ? "border-orange-500/20 bg-orange-500/5" : "border-red-500/20 bg-red-500/5"}`}>
              <p className={`text-xs font-medium mb-1 ${proofStatus === "proof_reupload_requested" ? "text-orange-400" : "text-red-400"}`}>
                {proofStatus === "proof_reupload_requested" ? "↩ Neu einreichen angefordert" : "Ablehnungsgrund"}
              </p>
              <p className="text-sm text-foreground/80">{video.proof_rejection_reason}</p>
              {video.proof_reviewer_name && (
                <p className="text-xs text-muted-foreground mt-1">
                  Von {video.proof_reviewer_name} · {formatDateTime(video.proof_reviewed_at)}
                </p>
              )}
            </div>
          )}

          {/* Approved info */}
          {proofStatus === "proof_approved" && video.proof_reviewer_name && (
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
              <p className="text-xs text-emerald-400 font-medium">
                ✓ Genehmigt von {video.proof_reviewer_name} · {formatDateTime(video.proof_reviewed_at)}
              </p>
            </div>
          )}

          {/* ── Review actions ────────────────────────────────────── */}
          {(canApproveReject || canStartReview || canRequestReupload) && (
            <div className="space-y-3 border-t border-border pt-4">
              <p className="text-xs font-medium text-muted-foreground">Prüfungsaktionen</p>

              {/* Start review */}
              {canStartReview && (
                <button
                  onClick={() => doAction("start_review")}
                  disabled={actionLoading !== null}
                  className="w-full rounded-lg border border-purple-500/30 py-2 text-sm text-purple-400 hover:bg-purple-500/10 disabled:opacity-50 transition-colors"
                >
                  {actionLoading === "start_review" ? <RefreshCw className="h-3.5 w-3.5 animate-spin mx-auto" /> : "🔍 Prüfung starten"}
                </button>
              )}

              {/* Approve */}
              {canApproveReject && (
                <button
                  onClick={() => doAction("approve_proof")}
                  disabled={actionLoading !== null}
                  className="w-full rounded-lg bg-emerald-500/10 py-2.5 text-sm font-medium text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-50 transition-colors"
                >
                  {actionLoading === "approve_proof" ? <RefreshCw className="h-4 w-4 animate-spin mx-auto" /> : "✓ Beleg genehmigen"}
                </button>
              )}

              {/* Request reupload (reject + ask for new proof in one step) */}
              {canRequestReupload && (
                <div className="space-y-2">
                  {showRejectInput && (
                    <div className="flex gap-2">
                      <input
                        value={rejectReason}
                        onChange={e => setRejectReason(e.target.value)}
                        placeholder="Grund für Rückweisung…"
                        className="h-9 flex-1 rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-orange-500/60"
                      />
                      <button
                        onClick={() => {
                          doAction("request_reupload", { reason: rejectReason });
                          setShowRejectInput(false);
                          setRejectReason("");
                        }}
                        disabled={!rejectReason.trim() || actionLoading !== null}
                        className="h-9 rounded-lg bg-orange-500/10 px-4 text-sm text-orange-400 hover:bg-orange-500/20 disabled:opacity-50"
                      >
                        Anfordern
                      </button>
                    </div>
                  )}
                  <button
                    onClick={() => setShowRejectInput(v => !v)}
                    disabled={actionLoading !== null}
                    className="w-full rounded-lg border border-orange-500/30 py-2 text-sm text-orange-400 hover:bg-orange-500/10 disabled:opacity-50 transition-colors"
                  >
                    ↩ Neu einreichen lassen
                  </button>
                </div>
              )}

              {/* Hard reject (terminal — no reupload) */}
              {canApproveReject && (
                <button
                  onClick={() => doAction("reject_proof", { reason: rejectReason || "Beleg nicht akzeptiert." })}
                  disabled={actionLoading !== null}
                  className="w-full rounded-lg border border-red-500/20 py-2 text-xs text-red-400/70 hover:bg-red-500/5 hover:text-red-400 disabled:opacity-50 transition-colors"
                >
                  {actionLoading === "reject_proof" ? <RefreshCw className="h-3 w-3 animate-spin mx-auto" /> : "✕ Endgültig ablehnen (kein Reupload)"}
                </button>
              )}
            </div>
          )}

          {/* ── Internal review note ──────────────────────────────── */}
          <InternalNoteField
            videoId={id}
            currentNote={video.review_notes}
            onSaved={load}
          />

          {/* ── Proof timeline ────────────────────────────────────── */}
          {proofTimeline.length > 0 && (
            <div className="border-t border-border pt-4 space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Verlauf</p>
              <div className="space-y-1.5">
                {proofTimeline.map((entry, i) => (
                  <div key={entry.id ?? i} className="flex items-start gap-2 text-xs">
                    <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-muted-foreground/40 shrink-0 mt-1.5" />
                    <div className="flex-1 min-w-0">
                      <span className="text-foreground/80">
                        {describeAuditEntry(entry.action, entry.meta, entry.actor_name)}
                      </span>
                      {entry.actor_name && (
                        <span className="text-muted-foreground"> · {entry.actor_name}</span>
                      )}
                      {(() => {
                        try {
                          const meta = entry.meta ? JSON.parse(entry.meta) : null;
                          const note = meta?.reason ?? meta?.review_note ?? null;
                          return note ? <span className="text-muted-foreground/70"> — „{note}"</span> : null;
                        } catch { return null; }
                      })()}
                    </div>
                    <span className="text-muted-foreground/50 shrink-0 whitespace-nowrap">
                      {formatDateTime(entry.created_at)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Admin actions */}
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <h2 className="font-semibold text-sm">Admin-Aktionen</h2>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => doAction("mark_reviewed")}
              disabled={actionLoading !== null}
              className="flex items-center gap-1.5 rounded-lg border border-emerald-500/40 px-3 py-2 text-sm text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-50 transition-colors"
            >
              <CheckCircle2 className="h-4 w-4" />
              Als geprüft markieren
              {video.reviewed_by && (
                <span className="ml-1 text-xs opacity-60">({video.reviewed_by})</span>
              )}
            </button>

            {isFlagged ? (
              <button
                onClick={() => doAction("unflag")}
                disabled={actionLoading !== null}
                className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground hover:bg-accent disabled:opacity-50 transition-colors"
              >
                <FlagOff className="h-4 w-4" /> Entflaggen
              </button>
            ) : (
              <button
                onClick={() => setShowFlagInput(v => !v)}
                disabled={actionLoading !== null}
                className="flex items-center gap-1.5 rounded-lg border border-red-500/40 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 disabled:opacity-50 transition-colors"
              >
                <Flag className="h-4 w-4" /> Flaggen
              </button>
            )}

            <button
              onClick={() => doAction("request_proof")}
              disabled={actionLoading !== null}
              className="flex items-center gap-1.5 rounded-lg border border-blue-500/40 px-3 py-2 text-sm text-blue-400 hover:bg-blue-500/10 disabled:opacity-50 transition-colors"
            >
              <FileText className="h-4 w-4" /> Beleg anfordern
            </button>

            <button
              onClick={() => doAction("set_verified")}
              disabled={actionLoading !== null}
              className="flex items-center gap-1.5 rounded-lg bg-primary/15 px-3 py-2 text-sm text-primary hover:bg-primary/25 disabled:opacity-50 transition-colors"
            >
              <ShieldCheck className="h-4 w-4" /> Verifiziert setzen
            </button>
          </div>

          {showFlagInput && !isFlagged && (
            <div className="flex gap-2">
              <input
                value={flagReason}
                onChange={e => setFlagReason(e.target.value)}
                placeholder="Grund für Flag…"
                className="h-9 flex-1 rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-primary"
              />
              <button
                onClick={async () => {
                  await doAction("flag", { reason: flagReason });
                  setShowFlagInput(false);
                  setFlagReason("");
                }}
                disabled={!flagReason.trim() || actionLoading !== null}
                className="h-9 rounded-lg bg-red-500/10 px-4 text-sm text-red-400 hover:bg-red-500/20 disabled:opacity-50"
              >
                Flaggen
              </button>
            </div>
          )}
        </div>

        {/* Content attributes + internal notes */}
        <ClipAttributesPanel videoId={id} />
        <ClipNotesPanel videoId={id} />

        {/* Snapshot history */}
        {snapshots.length > 0 && (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-5 py-3 border-b border-border">
              <h2 className="font-semibold text-sm">Snapshot-Verlauf</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/20">
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Datum</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Views</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Quelle</th>
                    <th className="px-4 py-2.5 text-center text-xs font-medium text-muted-foreground">Konfidenz</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Typ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {snapshots.map((snap, i) => (
                    <tr key={snap.id ?? i} className="hover:bg-muted/20">
                      <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">{formatDateTime(snap.scraped_at)}</td>
                      <td className="px-4 py-2.5 text-right text-xs font-mono">{formatNum(snap.views ?? snap.api_views ?? snap.observed_views)}</td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">{snap.verification_source ?? "—"}</td>
                      <td className="px-4 py-2.5 text-center text-xs">
                        {snap.confidence_level != null ? (
                          <span className={`font-medium ${snap.confidence_level >= 80 ? "text-emerald-400" : snap.confidence_level >= 50 ? "text-yellow-400" : "text-red-400"}`}>
                            {snap.confidence_level}/100
                          </span>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">
                        {snap.snapshot_type ?? "—"}
                        {snap.success === 0 && snap.error_message && (
                          <span className="ml-1 text-red-400" title={snap.error_message}>(Fehler)</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Activity Log */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-5 py-3 border-b border-border flex items-center justify-between">
            <h2 className="font-semibold text-sm">Aktivitätslog</h2>
            <span className="text-xs text-muted-foreground tabular-nums">{auditTrail.length} Einträge</span>
          </div>
          {auditTrail.length === 0 ? (
            <div className="flex flex-col items-center py-10 gap-2 text-center">
              <p className="text-xs text-muted-foreground">Noch keine Aktivitäten für diesen Clip.</p>
            </div>
          ) : (
            <div className="divide-y divide-border/60">
              {auditTrail.map((entry, i) => {
                const description = describeAuditEntry(entry.action, entry.meta, entry.actor_name);
                const dotCls      = auditDotClass(entry.action);
                return (
                  <div key={entry.id ?? i} className="flex items-start gap-3 px-5 py-3.5 group">
                    {/* Avatar */}
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground mt-0.5 select-none">
                      {(entry.actor_name ?? "?").slice(0, 1).toUpperCase()}
                    </div>
                    {/* Description */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm leading-snug">{description}</p>
                      {/* Colored action tag */}
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className={`inline-block h-1.5 w-1.5 rounded-full shrink-0 ${dotCls}`} />
                        <span className="text-xs text-muted-foreground/60 font-mono">{entry.action ?? "—"}</span>
                      </div>
                    </div>
                    {/* Timestamp */}
                    <span className="shrink-0 text-xs text-muted-foreground whitespace-nowrap pt-0.5">
                      {formatDateTime(entry.created_at)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </main>
    </>
  );
}

function ViewCard({ label, value, border, source }: {
  label: string; value: string; border: string; source: string;
}) {
  return (
    <div className={`rounded-xl border-2 ${border} bg-card p-4 space-y-1`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold font-mono">{value}</p>
      <p className="text-xs text-muted-foreground">{source}</p>
    </div>
  );
}
