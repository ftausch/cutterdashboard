"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { CutterNav } from "@/components/cutter-nav";
import {
  ArrowLeft, ExternalLink, Trash2, RefreshCw, Check, X,
  Upload, Eye, Flag, AlertTriangle, ImageOff,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────
interface VideoDetail {
  id: string;
  platform: string | null;
  external_id: string | null;
  url: string | null;
  title: string | null;
  account_handle: string | null;
  current_views: number;
  claimed_views: number | null;
  views_at_last_invoice: number;
  unbilled_views: number;
  verification_status: string | null;
  verification_source: string | null;
  discrepancy_status: string | null;
  discrepancy_percent: number | null;
  proof_url: string | null;
  proof_status: string | null;
  proof_cutter_note: string | null;
  proof_rejection_reason: string | null;
  proof_reviewer_name: string | null;
  proof_reviewed_at: string | null;
  proof_uploaded_at: string | null;
  proof_requested_at: string | null;
  episode_id: string | null;
  episode_title: string | null;
  published_at: string | null;
  last_scraped_at: string | null;
  created_at: string | null;
  is_flagged: number | null;
  flag_reason: string | null;
}

// ── Config maps ───────────────────────────────────────────────────
const PLATFORM_LABELS: Record<string, string> = {
  youtube: "YouTube", tiktok: "TikTok", instagram: "Instagram", facebook: "Facebook",
};
const PLATFORM_COLORS: Record<string, string> = {
  youtube:   "bg-red-500/10 text-red-400 border border-red-500/20",
  tiktok:    "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20",
  instagram: "bg-pink-500/10 text-pink-400 border border-pink-500/20",
  facebook:  "bg-blue-500/10 text-blue-400 border border-blue-500/20",
};

const VERIFICATION_CONFIG: Record<string, { label: string; cls: string }> = {
  verified:           { label: "✓ Verifiziert",     cls: "text-emerald-400" },
  partially_verified: { label: "~ Teilweise",        cls: "text-yellow-400" },
  manual_proof:       { label: "Beleg",              cls: "text-blue-400" },
  claimed_only:       { label: "Nur Angabe",         cls: "text-orange-400" },
  unverified:         { label: "Ausstehend",         cls: "text-muted-foreground" },
};

const DISC_CONFIG: Record<string, { label: string; cls: string }> = {
  match:                 { label: "Übereinstimmung",    cls: "text-emerald-400" },
  minor_difference:      { label: "Geringe Differenz",  cls: "text-yellow-400" },
  suspicious_difference: { label: "⚠ Verdächtig",      cls: "text-orange-400" },
  critical_difference:   { label: "⚠ Kritisch",        cls: "text-red-400" },
};

const PROOF_STATUS_CONFIG: Record<string, { label: string; cls: string; border: string }> = {
  proof_submitted:          { label: "Eingereicht",      cls: "text-amber-400",   border: "border-amber-500/20 bg-amber-500/5" },
  proof_under_review:       { label: "In Prüfung",       cls: "text-purple-400",  border: "border-purple-500/20 bg-purple-500/5" },
  proof_approved:           { label: "✓ Genehmigt",      cls: "text-emerald-400", border: "border-emerald-500/20 bg-emerald-500/5" },
  proof_rejected:           { label: "✕ Abgelehnt",      cls: "text-red-400",     border: "border-red-500/20 bg-red-500/5" },
  proof_requested:          { label: "⚠ Angefordert",   cls: "text-orange-400",  border: "border-orange-500/20 bg-orange-500/5" },
  proof_reupload_requested: { label: "↩ Neu einreichen", cls: "text-orange-400",  border: "border-orange-500/20 bg-orange-500/5" },
};

// ── Helpers ───────────────────────────────────────────────────────
function formatNum(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return new Intl.NumberFormat("de-DE").format(n);
}

function formatDateTime(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("de-DE", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function formatRelative(d: string | null | undefined): string {
  if (!d) return "—";
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diff / 60_000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (mins < 2) return "gerade eben";
  if (mins < 60) return `vor ${mins}m`;
  if (hours < 24) return `vor ${hours}h`;
  if (days === 1) return "gestern";
  if (days < 7) return `vor ${days}T`;
  return new Date(d).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// ── Skeleton ──────────────────────────────────────────────────────
function DetailSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-28 rounded-2xl border border-border bg-card skeleton" />
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="md:col-span-3 space-y-4">
          <div className="h-40 rounded-2xl border border-border bg-card skeleton" />
          <div className="h-56 rounded-2xl border border-border bg-card skeleton" />
        </div>
        <div className="md:col-span-2 space-y-4">
          <div className="h-48 rounded-2xl border border-border bg-card skeleton" />
        </div>
      </div>
    </div>
  );
}

// ── Section label ──────────────────────────────────────────────────
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-3">
      {children}
    </p>
  );
}

// ── Stat tile ─────────────────────────────────────────────────────
function StatTile({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl bg-muted/30 px-4 py-3">
      <p className="text-[11px] text-muted-foreground mb-1">{label}</p>
      <p className={`text-xl font-bold tabular-nums tracking-tight ${accent ? "text-primary" : ""}`}>
        {value}
      </p>
    </div>
  );
}

// ── Client-side validation (mirrors backend rules) ────────────────
const CLIENT_MAX_BYTES = 8 * 1024 * 1024; // 8 MB — Supabase Storage limit

function validateFile(file: File): string | null {
  if (file.size === 0) {
    return "Die Datei ist leer. Bitte wähle eine gültige Bilddatei.";
  }
  // Normalise MIME type: some OS/browsers send "image/jpg" or empty string
  const rawType = (file.type || "").toLowerCase().trim();
  let effectiveType = rawType === "image/jpg" ? "image/jpeg" : rawType;
  if (!effectiveType) {
    const name = file.name.toLowerCase();
    if (name.endsWith(".jpg") || name.endsWith(".jpeg")) effectiveType = "image/jpeg";
    else if (name.endsWith(".png"))  effectiveType = "image/png";
    else if (name.endsWith(".webp")) effectiveType = "image/webp";
  }
  if (!["image/jpeg", "image/png", "image/webp"].includes(effectiveType)) {
    return `Ungültiger Dateityp („${(file.type || file.name.split(".").pop()) ?? "?"}"). Bitte ein Bild hochladen (JPEG, PNG, WebP).`;
  }
  if (file.size > CLIENT_MAX_BYTES) {
    const mb = (file.size / 1024 / 1024).toFixed(1);
    return `Datei ist zu groß (${mb} MB). Maximal 8 MB erlaubt.`;
  }
  return null; // valid
}

// Parse a fetch Response into a human-readable error string
async function parseUploadError(res: Response): Promise<string> {
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    try {
      const data = await res.json();
      if (data.error) return data.error as string;
    } catch { /* fall through */ }
  }
  // Non-JSON responses (Vercel-level errors, HTML pages)
  switch (res.status) {
    case 400: return "Ungültige Anfrage — bitte erneut versuchen.";
    case 401: return "Sitzung abgelaufen — bitte neu anmelden.";
    case 403: return "Keine Berechtigung für diesen Clip.";
    case 409: return "Für diesen Clip existiert bereits ein Nachweis. Bitte zuerst löschen.";
    case 413: return "Datei ist zu groß für den Server (max. 8 MB).";
    case 415: return "Dateityp wird nicht unterstützt. Bitte JPEG, PNG oder WebP hochladen.";
    case 503: return "Server vorübergehend nicht erreichbar — bitte in einer Minute erneut versuchen.";
    default:  return `Server-Fehler (${res.status}) — bitte erneut versuchen.`;
  }
}

// ── Proof Section ─────────────────────────────────────────────────
function ProofSection({ video, onRefresh }: { video: VideoDetail; onRefresh: () => void }) {
  const [uploading,  setUploading]  = useState(false);
  const [uploadOk,   setUploadOk]   = useState(false);
  const [deleting,   setDeleting]   = useState(false);
  const [err,        setErr]        = useState<string | null>(null);
  const [showViewer, setShowViewer] = useState(false);

  const status     = video.proof_status;
  const isApproved = status === "proof_approved";
  const hasProof   = !!video.proof_url;

  function showError(msg: string) {
    setErr(msg);
    setTimeout(() => setErr(null), 12000);
  }

  async function upload(file: File) {
    // 1. Client-side validation first — instant feedback, no round-trip
    const validationError = validateFile(file);
    if (validationError) { showError(validationError); return; }

    setUploading(true);
    setErr(null);
    setUploadOk(false);

    // 2. Build and send FormData
    const fd = new FormData();
    fd.append("file", file);

    let res: Response;
    try {
      res = await fetch(`/api/videos/${video.id}/proof`, { method: "POST", body: fd });
    } catch (networkErr) {
      setUploading(false);
      showError("Netzwerkfehler — bitte Verbindung prüfen und erneut versuchen.");
      return;
    }

    setUploading(false);

    if (!res.ok) {
      const msg = await parseUploadError(res);
      showError(msg);
      return;
    }

    // 3. Success
    setUploadOk(true);
    setTimeout(() => setUploadOk(false), 4000);
    onRefresh();
  }

  async function deleteProof() {
    if (!confirm("Nachweis wirklich löschen?")) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/videos/${video.id}/proof`, { method: "DELETE" });
      if (!res.ok) {
        const msg = await parseUploadError(res);
        showError(msg);
      }
    } catch {
      showError("Netzwerkfehler beim Löschen — bitte erneut versuchen.");
    }
    setDeleting(false);
    onRefresh();
  }

  // ── Error banner (shared by all states) ───────────────────────
  const errBanner = err && (
    <div className="flex items-start gap-2.5 rounded-xl border border-red-500/20 bg-red-500/5 px-3.5 py-3">
      <AlertTriangle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
      <p className="text-sm text-red-300 leading-snug">{err}</p>
    </div>
  );

  // ── Image viewer modal ─────────────────────────────────────────
  const viewerModal = showViewer && video.proof_url && (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm"
      onClick={() => setShowViewer(false)}
    >
      <div className="relative max-w-4xl w-full" onClick={e => e.stopPropagation()}>
        <button
          onClick={() => setShowViewer(false)}
          className="absolute -top-12 right-0 flex items-center gap-1.5 text-white/60 hover:text-white text-sm transition-colors"
        >
          <X className="h-4 w-4" /> Schließen
        </button>
        <img
          src={video.proof_url}
          alt="Nachweis"
          className="max-w-full max-h-[82vh] rounded-2xl object-contain mx-auto block shadow-2xl"
        />
      </div>
    </div>
  );

  // ── State: reupload requested (rejected + must replace) ──────
  if (status === "proof_reupload_requested") return (
    <div className="space-y-4">
      {viewerModal}
      <div className="flex items-start gap-3 rounded-xl border border-orange-500/20 bg-orange-500/5 px-4 py-3">
        <AlertTriangle className="h-4 w-4 text-orange-400 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-medium text-orange-400">Neuer Nachweis erforderlich</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Das Ops-Team hat deinen Nachweis zurückgewiesen und bittet dich, einen neuen Screenshot hochzuladen.
          </p>
          {video.proof_rejection_reason && (
            <p className="text-xs text-orange-300/80 mt-1.5 italic">„{video.proof_rejection_reason}"</p>
          )}
          {video.proof_reviewer_name && (
            <p className="text-xs text-muted-foreground/60 mt-1">
              Von {video.proof_reviewer_name} · {formatDateTime(video.proof_reviewed_at)}
            </p>
          )}
        </div>
      </div>
      {hasProof && (
        <ProofImage url={video.proof_url!} onClick={() => setShowViewer(true)} />
      )}
      <UploadZone onFile={upload} uploading={uploading} uploadOk={uploadOk} accent />
      <p className="text-xs text-muted-foreground/60 text-center">
        Der vorherige Nachweis wird beim Hochladen automatisch ersetzt.
      </p>
      {errBanner}
    </div>
  );

  // ── State: proof requested, no file yet ───────────────────────
  if (status === "proof_requested" && !hasProof) return (
    <div className="space-y-4">
      {viewerModal}
      <div className="flex items-start gap-3 rounded-xl border border-orange-500/20 bg-orange-500/5 px-4 py-3">
        <AlertTriangle className="h-4 w-4 text-orange-400 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-medium text-orange-400">Nachweis angefordert</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Das Ops-Team hat einen Screenshot angefordert. Bitte lade einen Nachweis hoch.
          </p>
          {video.proof_requested_at && (
            <p className="text-xs text-muted-foreground/60 mt-1">Angefordert {formatRelative(video.proof_requested_at)}</p>
          )}
        </div>
      </div>
      <UploadZone onFile={upload} uploading={uploading} uploadOk={uploadOk} accent />
      {errBanner}
    </div>
  );

  // ── State: approved ───────────────────────────────────────────
  if (isApproved && hasProof) return (
    <div className="space-y-3">
      {viewerModal}
      <ProofImage url={video.proof_url!} onClick={() => setShowViewer(true)} />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-emerald-400">✓ Genehmigt</span>
          {video.proof_reviewer_name && (
            <span className="text-xs text-muted-foreground">von {video.proof_reviewer_name}</span>
          )}
        </div>
        <span className="text-xs text-muted-foreground">{formatDateTime(video.proof_reviewed_at)}</span>
      </div>
      <button
        onClick={() => setShowViewer(true)}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-border py-2.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
      >
        <Eye className="h-4 w-4" /> Nachweis ansehen
      </button>
    </div>
  );

  // ── State: rejected ───────────────────────────────────────────
  if (status === "proof_rejected" && hasProof) return (
    <div className="space-y-3">
      {viewerModal}
      {video.proof_rejection_reason && (
        <div className="flex items-start gap-3 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3">
          <X className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-red-400">Nachweis abgelehnt</p>
            <p className="text-xs text-muted-foreground mt-0.5">{video.proof_rejection_reason}</p>
          </div>
        </div>
      )}
      <ProofImage url={video.proof_url!} onClick={() => setShowViewer(true)} />
      <div className="flex gap-2">
        <button
          onClick={() => setShowViewer(true)}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-border py-2.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        >
          <Eye className="h-3.5 w-3.5" /> Ansehen
        </button>
        <button
          onClick={deleteProof}
          disabled={deleting}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-red-500/20 bg-red-500/5 py-2.5 text-sm text-red-400 hover:bg-red-500/10 disabled:opacity-50 transition-colors"
        >
          {deleting ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
          Löschen
        </button>
      </div>
      {errBanner}
    </div>
  );

  // ── State: under review ───────────────────────────────────────
  if ((status === "proof_submitted" || status === "proof_under_review") && hasProof) return (
    <div className="space-y-3">
      {viewerModal}
      <ProofImage url={video.proof_url!} onClick={() => setShowViewer(true)} />
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-amber-400">⏳ Wird geprüft</span>
        {video.proof_uploaded_at && (
          <span className="text-xs text-muted-foreground">Hochgeladen {formatRelative(video.proof_uploaded_at)}</span>
        )}
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => setShowViewer(true)}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-border py-2.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        >
          <Eye className="h-3.5 w-3.5" /> Ansehen
        </button>
        <button
          onClick={deleteProof}
          disabled={deleting}
          className="flex items-center justify-center gap-1.5 rounded-xl border border-border px-4 py-2.5 text-sm text-muted-foreground hover:border-red-500/30 hover:text-red-400 hover:bg-red-500/5 disabled:opacity-50 transition-colors"
          title="Nachweis löschen"
        >
          {deleting ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
        </button>
      </div>
      {errBanner}
    </div>
  );

  // ── State: no proof yet ───────────────────────────────────────
  return (
    <div className="space-y-3">
      <UploadZone onFile={upload} uploading={uploading} uploadOk={uploadOk} />
      {errBanner}
    </div>
  );
}

function ProofImage({ url, onClick }: { url: string; onClick: () => void }) {
  const [errored, setErrored] = useState(false);
  return (
    <div
      className="group relative cursor-pointer overflow-hidden rounded-xl border border-border bg-muted/20"
      onClick={onClick}
    >
      {errored ? (
        <div className="flex h-48 items-center justify-center gap-2 text-muted-foreground">
          <ImageOff className="h-5 w-5" />
          <span className="text-sm">Bild nicht ladbar</span>
        </div>
      ) : (
        <>
          <img
            src={url}
            alt="Nachweis"
            className="w-full max-h-64 object-contain"
            onError={() => setErrored(true)}
          />
          <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/20 transition-colors">
            <Eye className="h-6 w-6 text-white opacity-0 group-hover:opacity-100 drop-shadow transition-opacity" />
          </div>
        </>
      )}
    </div>
  );
}

function UploadZone({
  onFile, uploading, uploadOk, accent = false,
}: {
  onFile: (f: File) => void;
  uploading: boolean;
  uploadOk: boolean;
  accent?: boolean;
}) {
  const [drag, setDrag] = useState(false);

  function handleFiles(files: FileList | null) {
    if (files?.[0]) onFile(files[0]);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDrag(false);
    handleFiles(e.dataTransfer.files);
  }

  const baseClass = `flex w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed py-9 transition-all select-none`;
  const stateClass =
    drag        ? "border-primary bg-primary/10 scale-[0.99]" :
    uploading   ? "border-primary/30 bg-primary/5 cursor-wait" :
    uploadOk    ? "border-emerald-500/40 bg-emerald-500/5" :
    accent      ? "border-orange-500/30 bg-orange-500/5 hover:bg-orange-500/10" :
                  "border-border bg-muted/10 hover:border-primary/30 hover:bg-accent/20";

  return (
    <div
      className={`${baseClass} ${stateClass}`}
      onDragOver={e => { e.preventDefault(); if (!uploading) setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={e => { if (!uploading) handleDrop(e); }}
      onClick={() => { if (!uploading && !uploadOk) (document.getElementById("proof-file-input") as HTMLInputElement)?.click(); }}
    >
      {uploading ? (
        <>
          <RefreshCw className="h-6 w-6 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Wird hochgeladen…</p>
        </>
      ) : uploadOk ? (
        <>
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/20 border border-emerald-500/30">
            <Check className="h-5 w-5 text-emerald-400" />
          </div>
          <p className="text-sm font-medium text-emerald-400">✓ Nachweis hochgeladen!</p>
        </>
      ) : drag ? (
        <>
          <Upload className="h-6 w-6 text-primary" />
          <p className="text-sm text-primary font-medium">Hier ablegen</p>
        </>
      ) : (
        <>
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-muted/50">
            <Upload className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium">Screenshot hochladen</p>
            <p className="text-xs text-muted-foreground mt-0.5">JPEG, PNG, WebP · max. 8 MB</p>
          </div>
        </>
      )}
      <input
        id="proof-file-input"
        type="file"
        accept="image/jpeg,image/jpg,image/png,image/webp,image/heic,image/heif"
        className="sr-only"
        disabled={uploading}
        onChange={e => { handleFiles(e.target.files); e.target.value = ""; }}
      />
    </div>
  );
}

// ── Views Section ─────────────────────────────────────────────────
function ViewsSection({ video, onUpdate }: { video: VideoDetail; onUpdate: (claimed: number | null) => void }) {
  const [value,   setValue]   = useState(video.claimed_views?.toString() ?? "");
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);
  const [err,     setErr]     = useState<string | null>(null);

  // sync input when video reloads
  useEffect(() => { setValue(video.claimed_views?.toString() ?? ""); }, [video.claimed_views]);

  async function save() {
    setErr(null);
    const rawInput = value.trim();
    const parsed = rawInput === "" ? null : parseInt(rawInput, 10);

    console.log("[ViewsSection.save] raw input:", JSON.stringify(rawInput));
    console.log("[ViewsSection.save] parsed value:", parsed, "(type:", typeof parsed, ")");

    if (parsed !== null && (isNaN(parsed) || parsed < 0)) {
      setErr("Bitte eine gültige Zahl eingeben.");
      return;
    }

    const payload = { claimed_views: parsed };
    console.log("[ViewsSection.save] payload to send:", JSON.stringify(payload));

    setSaving(true);
    const res = await fetch(`/api/videos/${video.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSaving(false);

    console.log("[ViewsSection.save] response status:", res.status, res.ok ? "OK" : "ERROR");

    if (res.ok) {
      onUpdate(parsed);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } else {
      const data = await res.json().catch((e) => {
        console.error("[ViewsSection.save] could not parse error response as JSON:", e);
        return {};
      });
      console.error("[ViewsSection.save] server error response:", data);
      setErr(data.error || "Fehler beim Speichern");
    }
  }

  const hasChange = value.trim() !== (video.claimed_views?.toString() ?? "");

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <StatTile label="Verifiziert" value={formatNum(video.current_views)} />
        <StatTile label="Meine Angabe" value={video.claimed_views != null ? formatNum(video.claimed_views) : "—"} />
        <StatTile
          label="Abrechenbar"
          value={video.unbilled_views > 0 ? `+${formatNum(video.unbilled_views)}` : "—"}
          accent={video.unbilled_views > 0}
        />
      </div>

      {/* Edit claimed views */}
      <div className="rounded-xl border border-border bg-muted/10 p-4 space-y-3">
        <p className="text-xs font-medium text-muted-foreground">Meine Views aktualisieren</p>
        <div className="flex gap-2">
          <input
            type="number"
            inputMode="numeric"
            value={value}
            onChange={e => { setValue(e.target.value); setSaved(false); setErr(null); }}
            placeholder="z. B. 50000"
            onKeyDown={e => { if (e.key === "Enter") save(); }}
            className={`h-10 flex-1 rounded-xl border bg-background px-3 text-sm tabular-nums outline-none transition-colors focus:ring-1 ${
              err
                ? "border-red-500 focus:border-red-500 focus:ring-red-500/20"
                : saved
                ? "border-emerald-500 focus:border-emerald-500 focus:ring-emerald-500/20"
                : "border-border focus:border-primary focus:ring-primary/20"
            }`}
          />
          <button
            onClick={save}
            disabled={saving || !hasChange}
            className={`h-10 rounded-xl px-4 text-sm font-semibold transition-colors disabled:opacity-40 flex items-center gap-1.5 ${
              saved
                ? "bg-emerald-500 text-white"
                : "bg-primary text-primary-foreground hover:opacity-90"
            }`}
          >
            {saving
              ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              : saved
              ? <><Check className="h-3.5 w-3.5" /> Gespeichert</>
              : "Speichern"}
          </button>
        </div>
        {err && <p className="text-xs text-red-400">{err}</p>}
        <p className="text-xs text-muted-foreground/60">
          Diese Angabe wird für den Vergleich mit den verifizierten Views genutzt.
        </p>
      </div>
    </div>
  );
}

// ── Status Row ────────────────────────────────────────────────────
function StatusRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5 border-b border-border/50 last:border-0">
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      <div className="text-right">{children}</div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────
export default function ClipDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [video,   setVideo]   = useState<VideoDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/videos/${id}`);
    if (res.status === 401) { router.push("/login"); return; }
    if (res.status === 404) { router.push("/videos"); return; }
    const json = await res.json();
    setVideo(json.video);
    setLoading(false);
  }, [id, router]);

  // Silent refresh — updates video without showing skeleton
  async function refresh() {
    const res = await fetch(`/api/videos/${id}`);
    if (res.ok) {
      const json = await res.json();
      setVideo(json.video);
    }
  }

  useEffect(() => { load(); }, [load]);

  async function handleDelete() {
    if (!confirm("Diesen Clip wirklich entfernen? Diese Aktion kann nicht rückgängig gemacht werden.")) return;
    setDeleting(true);
    const res = await fetch(`/api/videos/${id}`, { method: "DELETE" });
    if (res.ok) {
      router.push("/videos");
    } else {
      const data = await res.json().catch(() => ({}));
      alert(data.error || "Fehler beim Löschen");
      setDeleting(false);
    }
  }

  if (loading) return (
    <>
      <CutterNav />
      <main className="mx-auto max-w-5xl px-6 py-8">
        <div className="mb-6 h-5 w-32 skeleton rounded" />
        <DetailSkeleton />
      </main>
    </>
  );

  if (!video) return null;

  const isFlagged       = !!video.is_flagged;
  const proofCfg        = video.proof_status ? PROOF_STATUS_CONFIG[video.proof_status] : null;
  const verCfg          = VERIFICATION_CONFIG[video.verification_status ?? ""] ?? VERIFICATION_CONFIG.unverified;
  const discCfg         = video.discrepancy_status ? DISC_CONFIG[video.discrepancy_status] : null;

  return (
    <>
      <CutterNav />
      <main className="mx-auto max-w-5xl px-6 py-8 space-y-5">

        {/* ── Back ────────────────────────────────────────────── */}
        <Link
          href="/videos"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Zurück zu Videos
        </Link>

        {/* ── Header card ─────────────────────────────────────── */}
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">

            {/* Left: badges → title → URL */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-2.5">
                <span className={`rounded-md px-2.5 py-0.5 text-xs font-semibold ${PLATFORM_COLORS[video.platform ?? ""] ?? "bg-muted text-muted-foreground border border-border"}`}>
                  {PLATFORM_LABELS[video.platform ?? ""] ?? video.platform ?? "Unbekannt"}
                </span>
                {isFlagged && (
                  <span className="flex items-center gap-1 rounded-md bg-red-500/10 px-2.5 py-0.5 text-xs font-semibold text-red-400 border border-red-500/20">
                    <Flag className="h-3 w-3" /> Geflaggt
                  </span>
                )}
                {proofCfg && (
                  <span className={`rounded-md px-2.5 py-0.5 text-xs font-semibold border ${proofCfg.border} ${proofCfg.cls}`}>
                    {proofCfg.label}
                  </span>
                )}
              </div>
              <h1 className="text-xl font-bold leading-snug">{video.title || "Ohne Titel"}</h1>
              {video.url && (
                <a
                  href={video.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 mt-1 text-xs text-muted-foreground hover:text-primary transition-colors"
                >
                  <span className="truncate max-w-xs">{video.url}</span>
                  <ExternalLink className="h-3 w-3 shrink-0" />
                </a>
              )}
            </div>

            {/* Right: delete */}
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs text-muted-foreground hover:border-red-500/30 hover:text-red-400 hover:bg-red-500/5 disabled:opacity-40 transition-colors shrink-0"
            >
              {deleting ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              Clip löschen
            </button>
          </div>

          {/* Meta strip */}
          <div className="mt-4 pt-4 border-t border-border/60 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
            {video.episode_title && (
              <span>Episode: <span className="text-foreground/80 font-medium">{video.episode_title}</span></span>
            )}
            {video.account_handle && (
              <span>Handle: <span className="text-foreground/80">{video.account_handle}</span></span>
            )}
            {video.created_at && (
              <span>Eingereicht: <span className="text-foreground/80">{formatDateTime(video.created_at)}</span></span>
            )}
            {video.published_at && (
              <span>Veröffentlicht: <span className="text-foreground/80">{formatDateTime(video.published_at)}</span></span>
            )}
          </div>
        </div>

        {/* ── Flag banner ─────────────────────────────────────── */}
        {isFlagged && video.flag_reason && (
          <div className="flex items-start gap-3 rounded-2xl border border-red-500/20 bg-red-500/5 px-5 py-4">
            <Flag className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-red-400">Dieser Clip wurde geflaggt</p>
              <p className="text-xs text-muted-foreground mt-0.5">{video.flag_reason}</p>
            </div>
          </div>
        )}

        {/* ── Main 5/2 grid ────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-5">

          {/* ── Left column (3 wide) ────────────────────────── */}
          <div className="md:col-span-3 space-y-5">

            {/* Views card */}
            <div className="rounded-2xl border border-border bg-card p-5">
              <SectionLabel>Views</SectionLabel>
              <ViewsSection
                video={video}
                onUpdate={claimed => setVideo(v => v ? { ...v, claimed_views: claimed } : v)}
              />
            </div>

            {/* Proof card */}
            <div className="rounded-2xl border border-border bg-card p-5">
              <SectionLabel>Nachweis</SectionLabel>
              <ProofSection video={video} onRefresh={refresh} />
            </div>

          </div>

          {/* ── Right column (2 wide) ─────────────────────── */}
          <div className="md:col-span-2 space-y-5">

            {/* Status card */}
            <div className="rounded-2xl border border-border bg-card p-5">
              <SectionLabel>Status</SectionLabel>
              <div>
                <StatusRow label="Verifikation">
                  <span className={`text-xs font-medium ${verCfg.cls}`}>{verCfg.label}</span>
                </StatusRow>

                {proofCfg && (
                  <StatusRow label="Nachweis">
                    <span className={`text-xs font-medium ${proofCfg.cls}`}>{proofCfg.label}</span>
                  </StatusRow>
                )}

                {discCfg && (
                  <StatusRow label="Diskrepanz">
                    <span className={`text-xs font-medium ${discCfg.cls}`}>
                      {discCfg.label}
                      {video.discrepancy_percent != null && (
                        <span className="ml-1 font-mono">
                          {video.discrepancy_percent > 0 ? "+" : ""}{video.discrepancy_percent.toFixed(1)}%
                        </span>
                      )}
                    </span>
                  </StatusRow>
                )}

                <StatusRow label="Letzter Sync">
                  <span className="text-xs text-muted-foreground">
                    {video.last_scraped_at ? formatRelative(video.last_scraped_at) : "Ausstehend"}
                  </span>
                </StatusRow>

                {video.verification_source && (
                  <StatusRow label="Quelle">
                    <span className="text-xs text-muted-foreground">{video.verification_source}</span>
                  </StatusRow>
                )}
              </div>
            </div>

            {/* Review info — only if proof has been reviewed */}
            {video.proof_reviewer_name && (
              <div className={`rounded-2xl border p-5 ${
                video.proof_status === "proof_approved"
                  ? "border-emerald-500/20 bg-emerald-500/5"
                  : "border-red-500/20 bg-red-500/5"
              }`}>
                <SectionLabel>Review</SectionLabel>
                <p className={`text-sm font-semibold mb-1 ${video.proof_status === "proof_approved" ? "text-emerald-400" : "text-red-400"}`}>
                  {video.proof_status === "proof_approved" ? "✓ Genehmigt" : "✕ Abgelehnt"}
                </p>
                <p className="text-xs text-muted-foreground">
                  von {video.proof_reviewer_name}
                </p>
                {video.proof_reviewed_at && (
                  <p className="text-xs text-muted-foreground/70 mt-0.5">{formatDateTime(video.proof_reviewed_at)}</p>
                )}
                {video.proof_rejection_reason && (
                  <div className="mt-3 rounded-lg bg-red-500/5 border border-red-500/20 px-3 py-2">
                    <p className="text-xs text-red-300/80">{video.proof_rejection_reason}</p>
                  </div>
                )}
              </div>
            )}

            {/* Unbilled highlight — only if worth showing */}
            {video.unbilled_views > 0 && (
              <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5">
                <SectionLabel>Abrechenbar</SectionLabel>
                <p className="text-2xl font-bold text-primary tabular-nums tracking-tight">
                  +{formatNum(video.unbilled_views)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Views seit letzter Rechnung
                </p>
              </div>
            )}

          </div>
        </div>

      </main>
    </>
  );
}
