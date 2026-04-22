"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CutterNav } from "@/components/cutter-nav";
import { Plus, RefreshCw, Video, ArrowRight, ChevronRight } from "lucide-react";

// ── Types ────────────────────────────────────────────────────────
interface VideoRow {
  id: string;
  platform: string;
  url: string;
  title: string | null;
  current_views: number;
  claimed_views: number | null;
  unbilled_views: number;
  verification_status: string | null;
  discrepancy_status: string | null;
  discrepancy_percent: number | null;
  last_scraped_at: string | null;
  created_at: string;
  proof_url: string | null;
  proof_status: string | null;
  is_flagged?: boolean;
}

// ── Clip status derivation ───────────────────────────────────────
type ClipStatus = "submitted" | "syncing" | "verified" | "partial" | "needs_proof" | "reviewing" | "rejected";

function getClipStatus(v: VideoRow): ClipStatus {
  if (v.is_flagged) return "rejected";
  if (v.proof_status === "proof_submitted" || v.proof_status === "proof_under_review") return "reviewing";
  if (v.proof_status === "proof_reupload_requested") return "needs_proof";
  if (v.discrepancy_status === "critical_difference" || v.discrepancy_status === "suspicious_difference" || v.proof_status === "proof_requested") {
    if (!v.proof_url || v.proof_status === "proof_requested") return "needs_proof";
  }
  if (v.verification_status === "verified" || v.proof_status === "proof_approved") return "verified";
  if (v.verification_status === "partially_verified") return "partial";
  if (!v.last_scraped_at) return "submitted";
  return "syncing";
}

const CLIP_STATUS: Record<ClipStatus, { label: string; dot: string; text: string }> = {
  submitted:   { label: "Eingereicht",    dot: "bg-muted-foreground",     text: "text-muted-foreground" },
  syncing:     { label: "Wird gesynct",   dot: "bg-blue-400",             text: "text-blue-400" },
  verified:    { label: "Verifiziert",    dot: "bg-emerald-400",          text: "text-emerald-400" },
  partial:     { label: "Teilweise",      dot: "bg-yellow-400",           text: "text-yellow-400" },
  needs_proof: { label: "Beleg fehlt",    dot: "bg-orange-400 animate-pulse", text: "text-orange-400" },
  reviewing:   { label: "In Prüfung",     dot: "bg-purple-400",           text: "text-purple-400" },
  rejected:    { label: "Abgelehnt",      dot: "bg-red-400",              text: "text-red-400" },
};

const PROOF_STATUS: Record<string, { label: string; cls: string }> = {
  proof_submitted:    { label: "Eingereicht",  cls: "text-amber-400" },
  proof_under_review: { label: "In Prüfung",   cls: "text-purple-400" },
  proof_approved:     { label: "✓ Genehmigt",  cls: "text-emerald-400" },
  proof_rejected:     { label: "✕ Abgelehnt",  cls: "text-red-400" },
  proof_requested:          { label: "⚠ Angefordert",   cls: "text-orange-400" },
  proof_reupload_requested: { label: "↩ Neu einreichen", cls: "text-orange-400" },
};

const PLATFORM_LABELS: Record<string, string> = {
  youtube: "YouTube", tiktok: "TikTok", instagram: "Instagram", facebook: "Facebook",
};
const PLATFORM_COLORS: Record<string, string> = {
  youtube:   "bg-red-500/10 text-red-400 border border-red-500/20",
  tiktok:    "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20",
  instagram: "bg-pink-500/10 text-pink-400 border border-pink-500/20",
  facebook:  "bg-blue-500/10 text-blue-400 border border-blue-500/20",
};

// ── Helpers ──────────────────────────────────────────────────────
function formatNum(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  return new Intl.NumberFormat("de-DE").format(n);
}

function formatRelativeTime(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (mins < 2) return "gerade";
  if (mins < 60) return `${mins}m`;
  if (hours < 24) return `${hours}h`;
  if (days === 1) return "gestern";
  if (days < 7) return `${days}T`;
  return new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
}

function getRowAccent(v: VideoRow): string {
  if (v.is_flagged || v.discrepancy_status === "critical_difference" || v.proof_status === "proof_rejected") return "border-l-2 border-l-red-500/60";
  if (v.discrepancy_status === "suspicious_difference" || v.proof_status === "proof_requested" || v.proof_status === "proof_reupload_requested") return "border-l-2 border-l-orange-500/60";
  if (v.proof_status === "proof_submitted" || v.proof_status === "proof_under_review") return "border-l-2 border-l-purple-500/40";
  return "border-l-2 border-l-transparent";
}

// ── Skeleton ─────────────────────────────────────────────────────
function Skeleton() {
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="px-5 py-3 border-b border-border bg-muted/20">
        <div className="grid grid-cols-7 gap-4">
          {[180, 72, 64, 64, 88, 88, 64].map((w, i) => (
            <div key={i} className="skeleton h-3 rounded" style={{ width: w }} />
          ))}
        </div>
      </div>
      {[...Array(5)].map((_, i) => (
        <div key={i} className="px-5 py-4 border-b border-border last:border-0">
          <div className="grid grid-cols-7 gap-4 items-center">
            <div><div className="skeleton h-3.5 w-40 mb-1.5 rounded" /><div className="skeleton h-3 w-28 rounded" /></div>
            <div className="skeleton h-5 w-16 rounded-md" />
            <div className="skeleton h-4 w-12 rounded" />
            <div className="skeleton h-4 w-12 rounded" />
            <div className="skeleton h-4 w-20 rounded" />
            <div className="skeleton h-5 w-20 rounded-md" />
            <div className="skeleton h-4 w-8 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────
export default function VideosPage() {
  const router = useRouter();
  const [videos, setVideos] = useState<VideoRow[]>([]);
  const [loading, setLoading] = useState(true);

  function loadVideos() {
    setLoading(true);
    fetch("/api/videos")
      .then(r => { if (r.status === 401) { router.push("/login"); return null; } return r.json(); })
      .then(d => { if (d?.videos) setVideos(d.videos); })
      .finally(() => setLoading(false));
  }

  function reloadSilent() {
    fetch("/api/videos")
      .then(r => { if (r.status === 401) { router.push("/login"); return null; } return r.json(); })
      .then(d => { if (d?.videos) setVideos(d.videos); });
  }

  useEffect(() => { loadVideos(); }, []);

  const needsAttention = videos.filter(v => {
    const s = getClipStatus(v);
    return s === "needs_proof" || s === "rejected";
  }).length;

  return (
    <>
      <CutterNav />
      <main className="mx-auto max-w-6xl px-6 py-8">

        {/* ── Page header ───────────────────────────────────── */}
        <div className="mb-7 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Videos</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {loading ? "Lädt…" : `${videos.length} ${videos.length === 1 ? "Clip" : "Clips"}`}
              {needsAttention > 0 && (
                <span className="ml-2 text-orange-400 font-medium">
                  · {needsAttention} {needsAttention === 1 ? "benötigt" : "benötigen"} Aufmerksamkeit
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={reloadSilent}
              disabled={loading}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-40"
              title="Aktualisieren"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </button>
            <Link
              href="/videos/submit"
              className="flex items-center gap-1.5 rounded-xl bg-primary px-4 h-9 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
            >
              <Plus className="h-4 w-4" />
              Video einreichen
            </Link>
          </div>
        </div>

        {loading ? <Skeleton /> : videos.length === 0 ? (

          /* ── Empty state ────────────────────────────────── */
          <div className="rounded-2xl border border-border bg-card flex flex-col items-center py-24 px-6 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted border border-border">
              <Video className="h-7 w-7 text-muted-foreground" />
            </div>
            <h3 className="font-semibold text-base mb-1.5">Noch keine Videos</h3>
            <p className="text-sm text-muted-foreground mb-7 max-w-xs leading-relaxed">
              Reiche deinen ersten Clip ein. Views werden automatisch getrackt und du kannst Nachweise hochladen.
            </p>
            <Link
              href="/videos/submit"
              className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
            >
              <Plus className="h-4 w-4" />
              Ersten Clip einreichen
            </Link>
          </div>

        ) : (
          <>
            {/* ── Mobile cards ────────────────────────────── */}
            <div className="md:hidden space-y-2">
              {videos.map(v => {
                const s = getClipStatus(v);
                const cfg = CLIP_STATUS[s];
                const proof = v.proof_status ? PROOF_STATUS[v.proof_status] : null;
                return (
                  <button
                    key={v.id}
                    onClick={() => router.push(`/videos/${v.id}`)}
                    className={`w-full text-left rounded-xl border border-border bg-card p-4 hover:bg-accent/30 transition-colors ${getRowAccent(v)}`}
                  >
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-sm leading-snug truncate">{v.title || "Ohne Titel"}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">{v.url}</p>
                      </div>
                      <span className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-medium ${PLATFORM_COLORS[v.platform] ?? "bg-muted text-muted-foreground border border-border"}`}>
                        {PLATFORM_LABELS[v.platform] ?? v.platform}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5">
                          <div className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
                          <span className={`text-xs font-medium ${cfg.text}`}>{cfg.label}</span>
                        </div>
                        {proof && (
                          <span className={`text-xs ${proof.cls}`}>{proof.label}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="tabular-nums">{formatNum(v.current_views)}</span>
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* ── Desktop table ────────────────────────────── */}
            <div className="hidden md:block rounded-2xl border border-border bg-card overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/20">
                    <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground tracking-wide">Video</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground tracking-wide">Plattform</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground tracking-wide">Views ✓</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground tracking-wide">Views ~</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground tracking-wide">Nachweis</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground tracking-wide">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground tracking-wide">Sync</th>
                    <th className="w-16 px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {videos.map(v => {
                    const s = getClipStatus(v);
                    const cfg = CLIP_STATUS[s];
                    const proof = v.proof_status ? PROOF_STATUS[v.proof_status] : null;
                    return (
                      <tr
                        key={v.id}
                        onClick={() => router.push(`/videos/${v.id}`)}
                        className={`group cursor-pointer hover:bg-accent/20 transition-colors ${getRowAccent(v)}`}
                      >
                        {/* Video */}
                        <td className="px-5 py-3.5 max-w-xs">
                          <p className="font-medium text-sm leading-snug truncate">{v.title || "Ohne Titel"}</p>
                          <p className="text-xs text-muted-foreground/70 truncate mt-0.5 max-w-[200px]">{v.url}</p>
                        </td>

                        {/* Platform */}
                        <td className="px-4 py-3.5">
                          <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${PLATFORM_COLORS[v.platform] ?? "bg-muted text-muted-foreground border border-border"}`}>
                            {PLATFORM_LABELS[v.platform] ?? v.platform}
                          </span>
                        </td>

                        {/* Verified views */}
                        <td className="px-4 py-3.5 text-right tabular-nums font-medium text-sm">
                          {formatNum(v.current_views)}
                        </td>

                        {/* Claimed views */}
                        <td className="px-4 py-3.5 text-right tabular-nums text-sm text-muted-foreground">
                          {v.claimed_views != null ? formatNum(v.claimed_views) : <span className="text-border">—</span>}
                        </td>

                        {/* Proof status */}
                        <td className="px-4 py-3.5">
                          {proof
                            ? <span className={`text-xs font-medium ${proof.cls}`}>{proof.label}</span>
                            : <span className="text-xs text-muted-foreground/40">—</span>}
                        </td>

                        {/* Clip status */}
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-1.5">
                            <div className={`h-1.5 w-1.5 rounded-full shrink-0 ${cfg.dot}`} />
                            <span className={`text-xs font-medium ${cfg.text}`}>{cfg.label}</span>
                          </div>
                        </td>

                        {/* Last sync */}
                        <td className="px-4 py-3.5 text-xs text-muted-foreground whitespace-nowrap">
                          {formatRelativeTime(v.last_scraped_at)}
                        </td>

                        {/* Open */}
                        <td className="px-4 py-3.5">
                          <span className="flex items-center justify-end gap-1 text-xs text-muted-foreground/50 group-hover:text-primary transition-colors">
                            Öffnen <ArrowRight className="h-3.5 w-3.5" />
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

      </main>
    </>
  );
}
