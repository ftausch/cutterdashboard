"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { CutterNav } from "@/components/cutter-nav";
import {
  ChevronLeft, RefreshCw, Upload, CheckCircle2,
  AlertTriangle, X, ImageIcon, Send, Eye, Lock,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────
interface Report {
  id: string; cutter_id: string; platform: string; month: string; status: string;
  total_views: number | null; total_clips: number | null;
  total_likes: number | null; total_comments: number | null; total_shares: number | null;
  avg_watch_time_sec: number | null; followers_start: number | null; followers_end: number | null;
  top_countries: { code: string; name: string; pct: number }[];
  cutter_note: string | null;
  admin_review_note: string | null; reviewed_by_name: string | null; reviewed_at: string | null;
  submitted_at: string | null; created_at: string | null; updated_at: string | null;
  // lock fields
  is_editable: boolean;
  locked_at: string | null;
  locked_by_name: string | null;
  lock_reason: string | null;
}
interface Proof {
  id: string | null; signed_url: string | null; file_name: string | null;
  file_size: number | null; mime_type: string | null; description: string | null; uploaded_at: string | null;
}

// ── Status config ─────────────────────────────────────────────────────────
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

// ── Helpers ───────────────────────────────────────────────────────────────
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

// ── Lock banner ───────────────────────────────────────────────────────────
function LockBanner({ report }: { report: Report }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-red-500/25 bg-red-500/5 px-4 py-3.5">
      <Lock className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
      <div className="min-w-0">
        <p className="text-sm font-medium text-red-300">Bericht gesperrt</p>
        <p className="text-xs text-red-400/70 mt-0.5">
          Dieser Bericht wurde vom Admin gesperrt und kann nicht bearbeitet werden.
          {report.locked_by_name ? ` (${report.locked_by_name}${report.locked_at ? `, ${fmtDate(report.locked_at)}` : ""})` : ""}
        </p>
        {report.lock_reason && (
          <p className="text-xs text-red-300/60 mt-1">Grund: {report.lock_reason}</p>
        )}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────
export default function InsightDetailPage() {
  const { id }  = useParams<{ id: string }>();
  const router  = useRouter();

  const [report,  setReport]  = useState<Report | null>(null);
  const [proofs,  setProofs]  = useState<Proof[]>([]);
  const [loading, setLoading] = useState(true);
  const [err,     setErr]     = useState("");

  // Form state
  const [totalViews,    setTotalViews]    = useState("");
  const [totalClips,    setTotalClips]    = useState("");
  const [totalLikes,    setTotalLikes]    = useState("");
  const [totalComments, setTotalComments] = useState("");
  const [totalShares,   setTotalShares]   = useState("");
  const [avgWatch,      setAvgWatch]      = useState("");
  const [follStart,     setFollStart]     = useState("");
  const [follEnd,       setFollEnd]       = useState("");
  const [cutterNote,    setCutterNote]    = useState("");
  const [dirty,         setDirty]         = useState(false);
  const [saving,        setSaving]        = useState(false);
  const [saveMsg,       setSaveMsg]       = useState("");
  const [submitting,    setSubmitting]    = useState(false);
  const [submitErr,     setSubmitErr]     = useState("");

  // Upload
  const fileRef     = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState("");
  const [lightbox,  setLightbox]  = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    const res = await fetch(`/api/insights/${id}`);
    if (!res.ok) { setErr("Bericht nicht gefunden."); setLoading(false); return; }
    const json = await res.json();
    const r: Report = json.report;
    setReport(r);
    setProofs(json.proofs ?? []);
    setTotalViews(r.total_views !== null ? String(r.total_views) : "");
    setTotalClips(r.total_clips !== null ? String(r.total_clips) : "");
    setTotalLikes(r.total_likes !== null ? String(r.total_likes) : "");
    setTotalComments(r.total_comments !== null ? String(r.total_comments) : "");
    setTotalShares(r.total_shares !== null ? String(r.total_shares) : "");
    setAvgWatch(r.avg_watch_time_sec !== null ? String(r.avg_watch_time_sec) : "");
    setFollStart(r.followers_start !== null ? String(r.followers_start) : "");
    setFollEnd(r.followers_end !== null ? String(r.followers_end) : "");
    setCutterNote(r.cutter_note ?? "");
    setDirty(false);
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // A report is user-editable only when is_editable=true AND status allows editing
  const statusAllowsEdit = ["draft", "reupload_requested"].includes(report?.status ?? "");
  const isEditable       = report?.is_editable !== false && statusAllowsEdit;
  const isLocked         = report?.is_editable === false;

  function n(s: string): number | undefined {
    const v = parseInt(s.replace(/\D/g, ""), 10);
    return isNaN(v) ? undefined : v;
  }

  async function save() {
    if (!dirty || !isEditable) return;
    setSaving(true); setSaveMsg("");
    const body: Record<string, unknown> = {};
    if (n(totalViews)    !== undefined) body.total_views        = n(totalViews);
    if (n(totalClips)    !== undefined) body.total_clips        = n(totalClips);
    if (n(totalLikes)    !== undefined) body.total_likes        = n(totalLikes);
    if (n(totalComments) !== undefined) body.total_comments     = n(totalComments);
    if (n(totalShares)   !== undefined) body.total_shares       = n(totalShares);
    if (n(avgWatch)      !== undefined) body.avg_watch_time_sec = n(avgWatch);
    if (n(follStart)     !== undefined) body.followers_start    = n(follStart);
    if (n(follEnd)       !== undefined) body.followers_end      = n(follEnd);
    if (cutterNote)                     body.cutter_note        = cutterNote;

    const res = await fetch(`/api/insights/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await res.json();
    if (res.ok) { setSaveMsg("Gespeichert ✓"); setDirty(false); await load(); }
    else if (j.locked) { setSaveMsg("Gesperrt — Bearbeitung durch Admin blockiert."); }
    else { setSaveMsg(j.error ?? "Fehler"); }
    setSaving(false);
    setTimeout(() => setSaveMsg(""), 3000);
  }

  async function submit() {
    setSubmitErr("");
    if (dirty && isEditable) await save();
    setSubmitting(true);
    const res = await fetch(`/api/insights/${id}/submit`, { method: "POST" });
    const json = await res.json();
    if (res.ok) { await load(); }
    else { setSubmitErr(json.error ?? "Fehler beim Einreichen."); }
    setSubmitting(false);
  }

  async function uploadFile(file: File) {
    if (!isEditable) { setUploadErr("Gesperrt — Upload durch Admin blockiert."); return; }
    setUploading(true); setUploadErr("");
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`/api/insights/${id}/proofs`, { method: "POST", body: fd });
    const json = await res.json();
    if (res.ok || res.status === 201) {
      setProofs(p => [json, ...p]);
    } else {
      setUploadErr(json.locked ? "Gesperrt — Upload durch Admin blockiert." : (json.error ?? "Upload fehlgeschlagen."));
    }
    setUploading(false);
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
    e.target.value = "";
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    if (!isEditable) return;
    const file = e.dataTransfer.files[0];
    if (file) uploadFile(file);
  }

  if (loading) return (
    <div className="min-h-screen bg-background">
      <CutterNav />
      <div className="flex items-center justify-center min-h-[60vh]">
        <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    </div>
  );

  if (err || !report) return (
    <div className="min-h-screen bg-background">
      <CutterNav />
      <div className="mx-auto max-w-2xl px-6 py-12 text-center text-muted-foreground">
        <p>{err || "Bericht nicht gefunden."}</p>
        <button onClick={() => router.back()} className="mt-4 text-sm underline">Zurück</button>
      </div>
    </div>
  );

  const cfg = STATUS_CFG[report.status] ?? STATUS_CFG.draft;

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

      <div className="mx-auto max-w-2xl px-4 sm:px-6 py-6 space-y-5">

        {/* Header */}
        <div>
          <Link href="/insights" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-3">
            <ChevronLeft className="h-3 w-3" /> Meine Berichte
          </Link>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-semibold">
              {PLATFORMS[report.platform] ?? report.platform} — {fmtMonth(report.month)}
            </h1>
            <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${cfg.badge}`}>
              {cfg.label}
            </span>
            {/* Editable / Locked badge */}
            {isLocked ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold text-red-400">
                <Lock className="h-2.5 w-2.5" /> Gesperrt
              </span>
            ) : statusAllowsEdit ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/5 px-2 py-0.5 text-[10px] font-medium text-emerald-500/70">
                Bearbeitbar
              </span>
            ) : null}
          </div>
          {report.submitted_at && (
            <p className="text-xs text-muted-foreground mt-1">Eingereicht: {fmtDate(report.submitted_at)}</p>
          )}
        </div>

        {/* Lock banner — shown when admin has locked the report */}
        {isLocked && <LockBanner report={report} />}

        {/* Admin feedback */}
        {["reupload_requested", "rejected", "approved"].includes(report.status) && report.admin_review_note && (
          <div className={`rounded-lg border px-4 py-3 text-sm ${
            report.status === "approved"
              ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-300"
              : report.status === "rejected"
              ? "border-red-500/30 bg-red-500/5 text-red-300"
              : "border-orange-500/30 bg-orange-500/5 text-orange-300"
          }`}>
            <p className="font-medium mb-0.5">
              {report.status === "approved" ? "✓ Genehmigt" :
               report.status === "rejected" ? "Abgelehnt" : "Bitte überarbeiten"}
              {report.reviewed_by_name ? ` von ${report.reviewed_by_name}` : ""}
              {report.reviewed_at ? ` · ${fmtDate(report.reviewed_at)}` : ""}
            </p>
            <p className="text-xs opacity-80">{report.admin_review_note}</p>
          </div>
        )}

        {/* Screenshot upload */}
        <div className="rounded-xl border border-border bg-card px-4 py-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <ImageIcon className="h-4 w-4 text-muted-foreground" />
              Screenshots ({proofs.length}/10)
            </h2>
            {isEditable && (
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading || proofs.length >= 10}
                className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:border-border/80 disabled:opacity-50 transition-colors"
              >
                {uploading ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                Hochladen
              </button>
            )}
          </div>

          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFileChange} />
          {uploadErr && <p className="text-xs text-red-400 mb-2">{uploadErr}</p>}

          {proofs.length === 0 ? (
            isEditable ? (
              <div
                className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-border py-8 text-center cursor-pointer hover:border-primary/30 transition-colors"
                onDragOver={e => e.preventDefault()}
                onDrop={onDrop}
                onClick={() => fileRef.current?.click()}
              >
                <Upload className="h-8 w-8 text-muted-foreground/40 mb-2" />
                <p className="text-sm text-muted-foreground">Screenshot hierher ziehen oder klicken</p>
                <p className="text-xs text-muted-foreground/60 mt-1">JPEG, PNG, WebP · max. 15 MB</p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-4">Keine Screenshots hochgeladen.</p>
            )
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
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
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                    <Eye className="h-5 w-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 p-1.5 bg-gradient-to-t from-black/60 to-transparent">
                    <p className="text-[10px] text-white/80 truncate">{p.file_name ?? "Screenshot"}</p>
                    {p.file_size && <p className="text-[9px] text-white/50">{fmtBytes(p.file_size)}</p>}
                  </div>
                </div>
              ))}
              {isEditable && proofs.length < 10 && (
                <div
                  className="flex items-center justify-center rounded-lg border-2 border-dashed border-border aspect-video cursor-pointer hover:border-primary/30 transition-colors"
                  onClick={() => fileRef.current?.click()}
                >
                  <PlusIcon />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Numbers form */}
        <div className="rounded-xl border border-border bg-card px-4 py-4">
          <h2 className="text-sm font-semibold mb-4">Zahlen</h2>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Views gesamt *", value: totalViews,    set: setTotalViews,    required: true },
              { label: "Clips gesamt",   value: totalClips,    set: setTotalClips },
              { label: "Likes",          value: totalLikes,    set: setTotalLikes },
              { label: "Kommentare",     value: totalComments, set: setTotalComments },
              { label: "Shares",         value: totalShares,   set: setTotalShares },
              { label: "Ø Watch-Time (Sek.)", value: avgWatch, set: setAvgWatch },
              { label: "Follower (Anfang)",   value: follStart, set: setFollStart },
              { label: "Follower (Ende)",     value: follEnd,   set: setFollEnd },
            ].map(({ label, value, set, required }) => (
              <div key={label}>
                <label className="text-[11px] text-muted-foreground block mb-1">{label}</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={value}
                  readOnly={!isEditable}
                  onChange={e => { if (isEditable) { (set as (v: string) => void)(e.target.value); setDirty(true); } }}
                  placeholder={required ? "Pflichtfeld" : "Optional"}
                  className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none transition-colors ${
                    !isEditable
                      ? "border-border/40 bg-muted/20 text-muted-foreground cursor-default"
                      : required && !value
                      ? "border-orange-500/40 bg-background focus:ring-1 focus:ring-primary/50"
                      : "border-border bg-background focus:ring-1 focus:ring-primary/50"
                  }`}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Note */}
        <div className="rounded-xl border border-border bg-card px-4 py-4">
          <h2 className="text-sm font-semibold mb-3">Notiz (optional)</h2>
          <textarea
            value={cutterNote}
            readOnly={!isEditable}
            onChange={e => { if (isEditable) { setCutterNote(e.target.value); setDirty(true); } }}
            rows={3}
            placeholder="Besonderheiten, Kontext, Anmerkungen…"
            className={`w-full rounded-lg border px-3 py-2 text-sm resize-none placeholder:text-muted-foreground/40 focus:outline-none ${
              !isEditable
                ? "border-border/40 bg-muted/20 text-muted-foreground cursor-default"
                : "border-border bg-background focus:ring-1 focus:ring-primary/50"
            }`}
          />
        </div>

        {/* Actions — only when editable */}
        {isEditable && (
          <div className="space-y-3">
            {submitErr && (
              <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-400">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {submitErr}
              </div>
            )}
            <div className="flex gap-2">
              <button
                onClick={save}
                disabled={saving || !dirty}
                className="flex items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50 transition-colors"
              >
                {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Speichern
              </button>
              <button
                onClick={submit}
                disabled={submitting}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {submitting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Einreichen
              </button>
            </div>
            {saveMsg && <p className="text-xs text-muted-foreground">{saveMsg}</p>}
            <p className="text-xs text-muted-foreground">
              * Mindestens die Views und ein Screenshot sind zum Einreichen erforderlich.
            </p>
          </div>
        )}

        {/* Submitted/under_review read-only banner */}
        {["submitted", "under_review"].includes(report.status) && !isLocked && (
          <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 px-4 py-3 text-sm text-blue-300 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            Bericht wurde eingereicht und wird geprüft.
          </div>
        )}

        {/* Timestamps */}
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-[11px] text-muted-foreground pb-4">
          <span>Erstellt: {fmtDate(report.created_at)}</span>
          <span>Aktualisiert: {fmtDate(report.updated_at)}</span>
        </div>

      </div>
    </div>
  );
}

function Save({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <polyline points="17 21 17 13 7 13 7 21" />
      <polyline points="7 3 7 8 15 8" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg className="h-5 w-5 text-muted-foreground/40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
