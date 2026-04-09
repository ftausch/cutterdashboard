"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CutterNav } from "@/components/cutter-nav";
import { RefreshCw, CheckCircle2, XCircle, ExternalLink } from "lucide-react";

interface PendingProof {
  id: string;
  title: string | null;
  url: string;
  platform: string;
  proof_url: string;
  proof_uploaded_at: string;
  proof_status: string;
  claimed_views: number | null;
  current_views: number;
  observed_views: number | null;
  api_views: number | null;
  verification_source: string | null;
  confidence_level: number | null;
  discrepancy_status: string | null;
  discrepancy_percent: number | null;
  cutter_name: string;
  cutter_id: string;
}

const PLATFORM_LABELS: Record<string, string> = {
  youtube: "YouTube",
  tiktok: "TikTok",
  instagram: "Instagram",
  facebook: "Facebook",
};

const PLATFORM_COLORS: Record<string, string> = {
  youtube: "bg-red-500/10 text-red-400",
  tiktok: "bg-cyan-500/10 text-cyan-400",
  instagram: "bg-pink-500/10 text-pink-400",
  facebook: "bg-blue-500/10 text-blue-400",
};

function formatNum(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("de-DE").format(n);
}

export default function OpsVerificationPage() {
  const router = useRouter();
  const [proofs, setProofs] = useState<PendingProof[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/ops/verification");
    if (res.status === 401) { router.push("/login"); return; }
    if (res.status === 403) { router.push("/dashboard"); return; }
    const json = await res.json();
    setProofs(json.proofs ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleAction(videoId: string, action: "approve" | "reject") {
    setActing(videoId);
    await fetch("/api/ops/verification", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ videoId, action }),
    });
    await load();
    setActing(null);
  }

  return (
    <>
      <CutterNav />
      <main className="mx-auto max-w-5xl p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Proof Review Queue</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Ausstehende Nachweise prüfen und genehmigen
            </p>
          </div>
          <button
            onClick={load}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm hover:bg-accent"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Aktualisieren
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            <RefreshCw className="h-5 w-5 animate-spin mr-2" />
            Lade Nachweise…
          </div>
        ) : proofs.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-12 text-center text-muted-foreground text-sm">
            Keine ausstehenden Nachweise
          </div>
        ) : (
          <div className="space-y-4">
            {proofs.map((proof) => (
              <div
                key={proof.id}
                className="rounded-xl border border-border bg-card p-5 space-y-4"
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-medium ${PLATFORM_COLORS[proof.platform] ?? "bg-muted"}`}
                      >
                        {PLATFORM_LABELS[proof.platform] ?? proof.platform}
                      </span>
                      <span className="font-medium truncate">
                        {proof.title || "Ohne Titel"}
                      </span>
                    </div>
                    <p className="mt-1 text-sm font-semibold text-foreground/80">{proof.cutter_name}</p>
                    <a
                      href={proof.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary mt-0.5"
                    >
                      {proof.url}
                      <ExternalLink className="h-3 w-3 shrink-0" />
                    </a>
                  </div>
                  <div className="shrink-0 text-right text-xs text-muted-foreground">
                    <p>Eingereicht: {new Date(proof.proof_uploaded_at).toLocaleString("de-DE", {
                      day: "2-digit", month: "2-digit", year: "numeric",
                      hour: "2-digit", minute: "2-digit",
                    })}</p>
                  </div>
                </div>

                {/* View stats — show all 3 tiers */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 rounded-lg border border-border bg-muted/20 p-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Angegeben (Klipper)</p>
                    <p className="font-semibold">{formatNum(proof.claimed_views)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Beobachtet (Scraper)</p>
                    <p className="font-semibold">{formatNum(proof.observed_views ?? proof.current_views)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Offizielle API</p>
                    <p className="font-semibold">{formatNum(proof.api_views)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Konfidenz</p>
                    <div className="flex items-center gap-1.5">
                      <div className="h-1.5 w-16 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${proof.confidence_level ?? 0}%` }}
                        />
                      </div>
                      <span className="font-semibold text-xs">{proof.confidence_level ?? 0}%</span>
                    </div>
                  </div>
                </div>
                {/* Discrepancy badge */}
                {proof.discrepancy_status && proof.discrepancy_status !== 'cannot_verify' && (
                  <div className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium ${
                    proof.discrepancy_status === 'match' ? 'bg-emerald-500/10 text-emerald-400' :
                    proof.discrepancy_status === 'minor_difference' ? 'bg-yellow-500/10 text-yellow-400' :
                    proof.discrepancy_status === 'suspicious_difference' ? 'bg-orange-500/10 text-orange-400' :
                    'bg-red-500/10 text-red-400'
                  }`}>
                    {proof.discrepancy_status === 'match' && '✓ Übereinstimmung'}
                    {proof.discrepancy_status === 'minor_difference' && `~ Kleine Abweichung (${proof.discrepancy_percent}%)`}
                    {proof.discrepancy_status === 'suspicious_difference' && `⚠ Verdächtig (${proof.discrepancy_percent}%)`}
                    {proof.discrepancy_status === 'critical_difference' && `✕ Kritisch (${proof.discrepancy_percent}%)`}
                    {' '}· Quelle: {proof.verification_source ?? '—'}
                  </div>
                )}

                {/* Proof image */}
                <div className="rounded-lg border border-border overflow-hidden">
                  <img
                    src={proof.proof_url}
                    alt="Nachweis"
                    className="max-h-48 w-full object-contain rounded"
                  />
                </div>

                {/* Actions */}
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => handleAction(proof.id, "approve")}
                    disabled={acting === proof.id}
                    className="flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-50"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Genehmigen
                  </button>
                  <button
                    onClick={() => handleAction(proof.id, "reject")}
                    disabled={acting === proof.id}
                    className="flex items-center gap-1.5 rounded-lg bg-red-500/10 px-4 py-2 text-sm font-medium text-red-400 hover:bg-red-500/20 disabled:opacity-50"
                  >
                    <XCircle className="h-4 w-4" />
                    Ablehnen
                  </button>
                  {acting === proof.id && (
                    <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
