"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CutterNav } from "@/components/cutter-nav";
import {
  Plus, Trash2, ExternalLink, RefreshCw, Pencil, Check, X, Upload, Video,
} from "lucide-react";

interface VideoRow {
  id: string;
  platform: string;
  external_id: string;
  url: string;
  title: string | null;
  account_handle: string | null;
  current_views: number;
  claimed_views: number | null;
  views_at_last_invoice: number;
  unbilled_views: number;
  verification_status: string | null;
  discrepancy_status: string | null;
  discrepancy_percent: number | null;
  last_scraped_at: string | null;
  created_at: string;
  proof_url: string | null;
  proof_status: string | null;
  proof_submitted_at?: string | null;
  episode_id: string | null;
  is_flagged?: boolean;
}

type ClipStatus =
  | "submitted"
  | "syncing"
  | "verified"
  | "partially_verified"
  | "manual_proof_required"
  | "under_review"
  | "rejected";

function getClipStatus(v: VideoRow): ClipStatus {
  if (v.is_flagged) return "rejected";
  if (v.proof_status === "submitted") return "under_review";
  if (
    v.discrepancy_status === "critical_difference" ||
    v.discrepancy_status === "suspicious_difference"
  ) {
    if (!v.proof_url) return "manual_proof_required";
  }
  if (v.verification_status === "verified") return "verified";
  if (v.verification_status === "partially_verified") return "partially_verified";
  if (!v.last_scraped_at) return "submitted";
  return "syncing";
}

const STATUS_CONFIG: Record<ClipStatus, { label: string; className: string }> = {
  submitted:             { label: "Eingereicht",  className: "bg-muted/50 text-muted-foreground border border-border" },
  syncing:               { label: "⟳ Syncing",    className: "bg-blue-500/10 text-blue-400 border border-blue-500/20" },
  verified:              { label: "✓ Verifiziert", className: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" },
  partially_verified:    { label: "~ Teilweise",   className: "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20" },
  manual_proof_required: { label: "⚠ Beleg nötig", className: "bg-orange-500/10 text-orange-400 border border-orange-500/20" },
  under_review:          { label: "In Prüfung",    className: "bg-purple-500/10 text-purple-400 border border-purple-500/20" },
  rejected:              { label: "✕ Abgelehnt",   className: "bg-red-500/10 text-red-400 border border-red-500/20" },
};

function formatRelativeTime(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (mins < 2) return "gerade eben";
  if (mins < 60) return `vor ${mins}m`;
  if (hours < 24) return `vor ${hours}h`;
  if (days === 1) return "gestern";
  if (days < 7) return `vor ${days}T`;
  return new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
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

const VERIFICATION_CONFIG: Record<string, { label: string; className: string }> = {
  verified:           { label: "✓ Verifiziert",    className: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" },
  partially_verified: { label: "~ Teilweise",       className: "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20" },
  claimed_only:       { label: "Nur Angabe",         className: "bg-orange-500/10 text-orange-400 border border-orange-500/20" },
  manual_proof:       { label: "Beleg",              className: "bg-blue-500/10 text-blue-400 border border-blue-500/20" },
  unavailable:        { label: "Nicht verfügbar",    className: "bg-muted/50 text-muted-foreground border border-border" },
  unverified:         { label: "Ausstehend",         className: "bg-muted/50 text-muted-foreground border border-border" },
};

const DISCREPANCY_CONFIG: Record<string, { label: string; className: string }> = {
  match:                 { label: "Übereinstimmung",  className: "bg-emerald-500/10 text-emerald-400" },
  minor_difference:      { label: "Kleine Abw.",      className: "bg-yellow-500/10 text-yellow-400" },
  suspicious_difference: { label: "⚠ Verdächtig",    className: "bg-orange-500/10 text-orange-400" },
  critical_difference:   { label: "⚠ Kritisch",      className: "bg-red-500/10 text-red-400" },
  cannot_verify:         { label: "Nicht prüfbar",    className: "bg-muted/50 text-muted-foreground" },
};

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return new Intl.NumberFormat("de-DE").format(n);
}

// ── Skeleton ─────────────────────────────────────────────────
function TableSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="border-b border-border px-4 py-3">
        <div className="grid grid-cols-8 gap-4">
          {["Video", "Plattform", "Views", "Gemeldet", "Clip-Status", "Zuletzt sync", "Nachweis", ""].map((h) => (
            <div key={h} className="skeleton h-3 w-16" />
          ))}
        </div>
      </div>
      {[...Array(6)].map((_, i) => (
        <div key={i} className="border-b border-border px-4 py-4 last:border-0">
          <div className="grid grid-cols-8 gap-4 items-center">
            <div>
              <div className="skeleton h-4 w-40 mb-1.5" />
              <div className="skeleton h-3 w-28" />
            </div>
            <div className="skeleton h-5 w-16 rounded-md" />
            <div className="skeleton h-4 w-12" />
            <div className="skeleton h-4 w-12" />
            <div className="skeleton h-5 w-20 rounded-md" />
            <div className="skeleton h-4 w-14" />
            <div className="skeleton h-6 w-16 rounded-md" />
            <div className="skeleton h-5 w-5 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Badges ────────────────────────────────────────────────────
function VerificationBadge({ status }: { status: string | null }) {
  if (!status) return null;
  const cfg = VERIFICATION_CONFIG[status] ?? VERIFICATION_CONFIG.unverified;
  return (
    <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium ${cfg.className}`}>
      {cfg.label}
    </span>
  );
}

function DiscrepancyBadge({ status, percent }: { status: string | null; percent: number | null }) {
  if (!status || status === "cannot_verify") return null;
  const cfg = DISCREPANCY_CONFIG[status] ?? DISCREPANCY_CONFIG.cannot_verify;
  return (
    <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium ${cfg.className}`}>
      {cfg.label}{percent !== null ? ` ${percent}%` : ""}
    </span>
  );
}

// ── Claimed Views Cell ────────────────────────────────────────
function ClaimedViewsCell({ video, onUpdate }: { video: VideoRow; onUpdate: (id: string, val: number | null) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(video.claimed_views?.toString() ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const parsed = value.trim() === "" ? null : parseInt(value, 10);
    if (parsed !== null && (isNaN(parsed) || parsed < 0)) { setSaving(false); return; }
    const res = await fetch(`/api/videos/${video.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ claimed_views: parsed }),
    });
    if (res.ok) { onUpdate(video.id, parsed); setEditing(false); }
    setSaving(false);
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input
          type="number"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="w-20 rounded-lg border border-primary/40 bg-background px-2 py-0.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/30"
          autoFocus
          onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
        />
        <button onClick={save} disabled={saving} className="text-primary hover:text-primary/80 transition-colors">
          <Check className="h-3.5 w-3.5" />
        </button>
        <button onClick={() => setEditing(false)} className="text-muted-foreground hover:text-foreground transition-colors">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => { setValue(video.claimed_views?.toString() ?? ""); setEditing(true); }}
      className="group flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
      title="Klicken zum Eintragen"
    >
      <span className="tabular-nums">{video.claimed_views !== null ? formatNum(video.claimed_views) : "—"}</span>
      <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-60 transition-opacity" />
    </button>
  );
}

// ── Proof Cell ────────────────────────────────────────────────
function ProofCell({ video, onReload }: { video: VideoRow; onReload: () => void }) {
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    await fetch(`/api/videos/${video.id}/proof`, { method: "POST", body: fd });
    setUploading(false);
    onReload();
    e.target.value = "";
  }

  async function handleDelete() {
    setDeleting(true);
    await fetch(`/api/videos/${video.id}/proof`, { method: "DELETE" });
    setDeleting(false);
    onReload();
  }

  if (!video.proof_status || video.proof_status === "none") {
    return (
      <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-muted/50 px-2.5 py-1 text-xs text-muted-foreground hover:border-primary/30 hover:text-foreground hover:bg-accent transition-all">
        {uploading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
        Hochladen
        <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={handleFileChange} disabled={uploading} />
      </label>
    );
  }
  if (video.proof_status === "pending") {
    return (
      <div className="flex items-center gap-1.5">
        <span className="rounded-md border border-amber-500/20 bg-amber-500/10 px-1.5 py-0.5 text-xs text-amber-400">
          Ausstehend
        </span>
        <button onClick={handleDelete} disabled={deleting} className="text-muted-foreground hover:text-destructive transition-colors" title="Entfernen">
          {deleting ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
        </button>
      </div>
    );
  }
  if (video.proof_status === "approved") {
    return <span className="rounded-md border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 text-xs text-emerald-400">✓ Genehmigt</span>;
  }
  if (video.proof_status === "rejected") {
    return (
      <label className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-red-500/10 border border-red-500/20 px-2 py-1 text-xs text-red-400 hover:bg-red-500/20 transition-colors">
        {uploading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
        Neu hochladen
        <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={handleFileChange} disabled={uploading} />
      </label>
    );
  }
  return null;
}

// ── Row background for discrepancy ───────────────────────────
function getRowClass(discrepancy: string | null): string {
  if (discrepancy === "critical_difference") return "border-l-2 border-red-500 bg-red-500/5";
  if (discrepancy === "suspicious_difference") return "border-l-2 border-amber-500 bg-amber-500/5";
  return "";
}

// ── Main Page ─────────────────────────────────────────────────
export default function CutterVideosPage() {
  const router = useRouter();
  const [videos, setVideos] = useState<VideoRow[]>([]);
  const [loading, setLoading] = useState(true);

  function loadVideos() {
    setLoading(true);
    fetch("/api/videos")
      .then((r) => {
        if (r.status === 401) { router.push("/login"); return null; }
        return r.json();
      })
      .then((data) => { if (data?.videos) setVideos(data.videos); })
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadVideos(); }, []);

  function handleClaimedUpdate(id: string, val: number | null) {
    setVideos((prev) => prev.map((v) => v.id === id ? { ...v, claimed_views: val } : v));
  }

  async function handleDelete(id: string) {
    if (!confirm("Video wirklich entfernen?")) return;
    const res = await fetch(`/api/videos/${id}`, { method: "DELETE" });
    if (res.ok) setVideos((v) => v.filter((x) => x.id !== id));
    else {
      const data = await res.json();
      alert(data.error || "Fehler beim Löschen");
    }
  }

  return (
    <>
      <CutterNav />
      <main className="mx-auto max-w-7xl p-6">

        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Videos</h1>
            {!loading && (
              <p className="text-sm text-muted-foreground mt-0.5">
                {videos.length} {videos.length === 1 ? "Video" : "Videos"} insgesamt
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={loadVideos}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm hover:bg-accent transition-colors disabled:opacity-50"
              title="Aktualisieren"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </button>
            <Link
              href="/videos/submit"
              className="btn-glow flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
            >
              <Plus className="h-4 w-4" />
              Video einreichen
            </Link>
          </div>
        </div>

        {/* Skeleton while loading */}
        {loading ? (
          <TableSkeleton />
        ) : videos.length === 0 ? (
          /* Empty state */
          <div className="rounded-xl border border-border bg-card flex flex-col items-center py-20 px-6 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted border border-border">
              <Video className="h-7 w-7 text-muted-foreground" />
            </div>
            <h3 className="font-semibold mb-1">Noch keine Videos</h3>
            <p className="text-sm text-muted-foreground mb-6 max-w-xs">
              Reiche dein erstes Video ein. Wir tracken die Views automatisch und du kannst sie zur Rechnung einreichen.
            </p>
            <Link
              href="/videos/submit"
              className="btn-glow flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
            >
              <Plus className="h-4 w-4" />
              Erstes Video einreichen
            </Link>
          </div>
        ) : (
          /* Table */
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30 text-left">
                    <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Video</th>
                    <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Plattform</th>
                    <th className="px-4 py-3 text-xs font-medium text-muted-foreground text-right">Views ✓</th>
                    <th className="px-4 py-3 text-xs font-medium text-muted-foreground text-right">
                      <span title="Deine gemeldeten Views — klicken zum Bearbeiten">Views ~</span>
                    </th>
                    <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Clip-Status</th>
                    <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Zuletzt sync</th>
                    <th className="px-4 py-3 text-xs font-medium text-muted-foreground text-right">Neu</th>
                    <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Nachweis</th>
                    <th className="w-10 px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {videos.map((v) => (
                    <tr key={v.id} className={`hover:bg-accent/20 transition-colors ${getRowClass(v.discrepancy_status)}`}>
                      <td className="max-w-xs px-4 py-3.5">
                        <p className="truncate font-medium text-sm">{v.title || "Ohne Titel"}</p>
                        <a
                          href={v.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 truncate text-xs text-muted-foreground hover:text-primary transition-colors mt-0.5"
                        >
                          <span className="truncate max-w-[180px]">{v.url}</span>
                          <ExternalLink className="h-3 w-3 shrink-0" />
                        </a>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${PLATFORM_COLORS[v.platform] || "bg-muted text-muted-foreground"}`}>
                          {PLATFORM_LABELS[v.platform] || v.platform}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-right font-semibold tabular-nums">
                        {formatNum(v.current_views)}
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <ClaimedViewsCell video={v} onUpdate={handleClaimedUpdate} />
                      </td>
                      <td className="px-4 py-3.5">
                        {(() => {
                          const s = getClipStatus(v);
                          const cfg = STATUS_CONFIG[s];
                          return (
                            <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium ${cfg.className}`}>
                              {cfg.label}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-3.5 text-xs text-muted-foreground whitespace-nowrap">
                        {formatRelativeTime(v.last_scraped_at)}
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        {v.unbilled_views > 0 ? (
                          <span className="font-semibold text-primary tabular-nums">
                            +{formatNum(v.unbilled_views)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        <ProofCell video={v} onReload={loadVideos} />
                      </td>
                      <td className="px-4 py-3.5">
                        <button
                          onClick={() => handleDelete(v.id)}
                          className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                          title="Video entfernen"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Helper text */}
        {!loading && videos.length > 0 && (
          <p className="mt-3 text-xs text-muted-foreground">
            <strong>Views ✓</strong> = verifiziert durch Scraping &nbsp;·&nbsp;
            <strong>Views ~</strong> = deine Angabe (klicken zum Bearbeiten) &nbsp;·&nbsp;
            <strong>Neu</strong> = noch nicht abgerechnete Views &nbsp;·&nbsp;
            <strong>Clip-Status</strong> = aktueller Prüf-Status
          </p>
        )}
      </main>
    </>
  );
}
