"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CutterNav } from "@/components/cutter-nav";
import {
  ArrowLeft,
  Send,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Plus,
  ChevronDown,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────
interface DetectedPlatform {
  platform: "youtube" | "tiktok" | "instagram" | "facebook";
  videoId: string;
  valid: boolean;
}

interface Episode {
  id: string;
  title: string;
}

// ── Platform detection ────────────────────────────────────────
function detectPlatform(raw: string): DetectedPlatform | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, "");

  // YouTube
  if (host === "youtube.com" || host === "youtu.be") {
    let videoId = "";
    if (host === "youtu.be") {
      videoId = url.pathname.slice(1).split("/")[0];
    } else if (url.pathname.startsWith("/shorts/")) {
      videoId = url.pathname.split("/shorts/")[1]?.split("/")[0] ?? "";
    } else {
      videoId = url.searchParams.get("v") ?? "";
    }
    return { platform: "youtube", videoId, valid: videoId.length > 0 };
  }

  // TikTok
  if (host === "tiktok.com" || host === "vm.tiktok.com") {
    const match = url.pathname.match(/\/@[^/]+\/video\/(\d+)/);
    const videoId = match?.[1] ?? "";
    return { platform: "tiktok", videoId, valid: videoId.length > 0 };
  }

  // Instagram
  if (host === "instagram.com") {
    const match = url.pathname.match(/\/(?:reel|p)\/([A-Za-z0-9_-]+)/);
    const videoId = match?.[1] ?? "";
    return { platform: "instagram", videoId, valid: videoId.length > 0 };
  }

  // Facebook
  if (host === "facebook.com" || host === "fb.watch" || host === "m.facebook.com") {
    const videoId =
      url.searchParams.get("v") ??
      url.pathname.match(/\/videos\/(\d+)/)?.[1] ??
      (host === "fb.watch" ? url.pathname.slice(1) : "") ??
      "";
    return { platform: "facebook", videoId, valid: videoId.length > 0 };
  }

  return null;
}

// ── Platform config ───────────────────────────────────────────
const PLATFORM_CONFIG = {
  youtube:   { label: "YouTube",   badge: "bg-red-500/10 text-red-400 border border-red-500/20" },
  tiktok:    { label: "TikTok",    badge: "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20" },
  instagram: { label: "Instagram", badge: "bg-pink-500/10 text-pink-400 border border-pink-500/20" },
  facebook:  { label: "Facebook",  badge: "bg-blue-500/10 text-blue-400 border border-blue-500/20" },
};

// ── Friendly error messages ───────────────────────────────────
function friendlyError(reason: string): string {
  if (reason.toLowerCase().includes("unsupported") || reason.toLowerCase().includes("platform")) {
    return "Link nicht erkannt — unterstützt: TikTok, YouTube, Instagram, Facebook";
  }
  if (reason.toLowerCase().includes("duplicate") || reason.toLowerCase().includes("already")) {
    return "Clip bereits eingereicht";
  }
  if (reason.toLowerCase().includes("account") || reason.toLowerCase().includes("no account")) {
    return "Kein Konto für diese Plattform verknüpft → bitte in Konten verknüpfen";
  }
  return reason;
}

// ── Main Page ─────────────────────────────────────────────────
export default function SubmitVideosPage() {
  const router = useRouter();

  // Form state
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [episodeId, setEpisodeId] = useState("");
  const [showOptional, setShowOptional] = useState(false);
  const [episodes, setEpisodes] = useState<Episode[]>([]);

  // Submission state
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Live detection
  const detected = url.trim() ? detectPlatform(url) : null;
  const urlValid = detected?.valid ?? false;
  const urlInvalid = url.trim().length > 0 && !urlValid;

  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Load episodes
  useEffect(() => {
    fetch("/api/episodes")
      .then((r) => {
        if (r.status === 401 || r.status === 403) {
          router.push("/login");
          return null;
        }
        return r.json();
      })
      .then((data) => {
        if (data?.episodes) setEpisodes(data.episodes);
      })
      .catch(() => {});
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!urlValid || loading) return;

    setLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch("/api/videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          urls: [url.trim()],
          title: title.trim() || undefined,
          notes: notes.trim() || undefined,
          episode_id: episodeId || undefined,
        }),
      });

      if (res.status === 401 || res.status === 403) {
        router.push("/login");
        return;
      }

      const data = await res.json();

      if (data.rejected?.length > 0) {
        setErrorMsg(friendlyError(data.rejected[0].reason));
      } else if (data.accepted?.length > 0) {
        setSuccess(true);
      } else {
        setErrorMsg("Unbekannter Fehler beim Einreichen.");
      }
    } catch {
      setErrorMsg("Verbindungsfehler — bitte erneut versuchen.");
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    setUrl("");
    setTitle("");
    setNotes("");
    setEpisodeId("");
    setErrorMsg(null);
    setSuccess(false);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  // ── Border color on URL input ─────────────────────────────
  const inputBorderClass = url.trim() === ""
    ? "border-input focus:border-primary focus:ring-1 focus:ring-primary/30"
    : urlValid
    ? "border-emerald-500/60 ring-1 ring-emerald-500/20"
    : "border-red-500/60 ring-1 ring-red-500/20";

  // ── Success screen ────────────────────────────────────────
  if (success) {
    return (
      <>
        <CutterNav />
        <main className="mx-auto max-w-lg p-6">
          <div className="mt-10 flex flex-col items-center rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-10 text-center">
            <CheckCircle2 className="mb-4 h-14 w-14 text-emerald-400" />
            <h2 className="mb-1 text-xl font-bold text-emerald-400">Clip eingereicht!</h2>
            <p className="mb-8 text-sm text-muted-foreground">
              Dein Clip wurde erfolgreich übermittelt. Wir verfolgen die Views automatisch.
            </p>
            <div className="flex gap-3">
              <button
                onClick={resetForm}
                className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
              >
                <Plus className="h-4 w-4" />
                Weiteren einreichen
              </button>
              <Link
                href="/videos"
                className="flex items-center gap-2 rounded-xl border border-border bg-card px-5 py-2.5 text-sm font-medium hover:bg-accent transition-colors"
              >
                Meine Videos
              </Link>
            </div>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <CutterNav />
      <main className="mx-auto max-w-lg p-6">
        <Link
          href="/videos"
          className="mb-5 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Zurück zu Videos
        </Link>

        <h1 className="mb-1 text-2xl font-bold">Clip einreichen</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          Füge den Link zu deinem Clip ein — wir erkennen die Plattform automatisch.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">

          {/* URL input */}
          <div className="rounded-xl border border-border bg-card p-5">
            <label className="mb-2 block text-sm font-semibold">
              Video-Link
            </label>
            <input
              ref={inputRef}
              type="url"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setErrorMsg(null);
              }}
              placeholder="https://www.tiktok.com/@handle/video/..."
              autoComplete="off"
              spellCheck={false}
              className={`w-full rounded-lg border bg-background px-3.5 py-3 text-sm outline-none transition-all duration-150 placeholder:text-muted-foreground ${inputBorderClass}`}
            />

            {/* Live detection feedback */}
            {url.trim() && (
              <div className="mt-2.5 flex items-center gap-2">
                {urlValid && detected ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                    <span
                      className={`rounded-md px-2 py-0.5 text-xs font-medium ${PLATFORM_CONFIG[detected.platform].badge}`}
                    >
                      {PLATFORM_CONFIG[detected.platform].label}
                    </span>
                    {detected.videoId && (
                      <span className="text-xs text-muted-foreground font-mono">
                        ID: {detected.videoId}
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    <XCircle className="h-4 w-4 shrink-0 text-red-400" />
                    <span className="text-xs text-red-400">
                      Link nicht erkannt — unterstützt: TikTok, YouTube, Instagram, Facebook
                    </span>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Episode selector */}
          <div className="rounded-xl border border-border bg-card p-5">
            <label className="mb-2 block text-sm font-semibold">
              Folge <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <select
              value={episodeId}
              onChange={(e) => setEpisodeId(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary/30 appearance-none cursor-pointer"
            >
              <option value="">Keine Folge</option>
              {episodes.map((ep) => (
                <option key={ep.id} value={ep.id}>
                  {ep.title}
                </option>
              ))}
            </select>
          </div>

          {/* Optional fields */}
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <button
              type="button"
              onClick={() => setShowOptional((p) => !p)}
              className="flex w-full items-center justify-between px-5 py-4 text-sm font-semibold hover:bg-accent/40 transition-colors"
            >
              Weitere Details
              <ChevronDown
                className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${showOptional ? "rotate-180" : ""}`}
              />
            </button>

            {showOptional && (
              <div className="border-t border-border px-5 py-4 space-y-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium">
                    Titel / Hook
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="z.B. 'Fabian über Marketing-Fehler'"
                    maxLength={120}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary/30"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium">
                    Notizen
                  </label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Besonderheiten, Kontext..."
                    rows={3}
                    maxLength={500}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none resize-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary/30"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Error message */}
          {errorMsg && (
            <div className="flex items-start gap-2.5 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-400">
              <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{errorMsg}</span>
              {errorMsg.includes("Konten") && (
                <Link
                  href="/accounts"
                  className="ml-auto shrink-0 flex items-center gap-1 text-xs underline hover:no-underline"
                >
                  Konten
                  <ExternalLink className="h-3 w-3" />
                </Link>
              )}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading || !urlValid}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Wird eingereicht…
              </span>
            ) : (
              <>
                <Send className="h-4 w-4" />
                Clip einreichen
              </>
            )}
          </button>

          <p className="text-center text-xs text-muted-foreground">
            Unterstützte Plattformen: TikTok, YouTube, Instagram, Facebook
          </p>
        </form>
      </main>
    </>
  );
}
