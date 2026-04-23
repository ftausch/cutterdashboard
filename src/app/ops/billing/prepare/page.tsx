"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CutterNav } from "@/components/cutter-nav";
import {
  RefreshCw, ChevronLeft, ChevronRight, CheckCircle2,
  AlertTriangle, Eye, Receipt,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────
interface Cutter {
  id: string;
  name: string;
  has_profile: boolean;
  rate_per_1k: number | null;
  currency: string;
}

interface EligibleClip {
  id: string;
  platform: string | null;
  url: string | null;
  title: string | null;
  verification_status: string | null;
  proof_status: string | null;
  current_views: number;
  verified_views: number;
  billed_baseline: number;
  billable_views: number;
  clip_date: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────
function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  return new Intl.NumberFormat("de-DE").format(n);
}
function eur(n: number): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency", currency: "EUR", maximumFractionDigits: 2,
  }).format(n);
}
function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

const PLATFORM_COLOR: Record<string, string> = {
  tiktok:    "text-pink-400 border-pink-500/20 bg-pink-500/8",
  youtube:   "text-red-400 border-red-500/20 bg-red-500/8",
  instagram: "text-purple-400 border-purple-500/20 bg-purple-500/8",
};
function PlatformBadge({ p }: { p: string | null }) {
  const color = PLATFORM_COLOR[p?.toLowerCase() ?? ""] ?? "text-muted-foreground border-border bg-muted/20";
  return (
    <span className={`inline-flex rounded-md border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${color}`}>
      {p ?? "—"}
    </span>
  );
}

// ── Step indicator ─────────────────────────────────────────────────────
function Steps({ step }: { step: number }) {
  const labels = ["Cutter & Zeitraum", "Clips prüfen", "Erstellen"];
  return (
    <div className="flex items-center gap-0">
      {labels.map((label, i) => {
        const idx   = i + 1;
        const done  = idx < step;
        const active = idx === step;
        return (
          <div key={idx} className="flex items-center">
            <div className="flex items-center gap-2">
              <div className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold border ${
                done   ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-400" :
                active ? "bg-primary/15 border-primary/30 text-primary" :
                "bg-muted/20 border-border text-muted-foreground/40"
              }`}>
                {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : idx}
              </div>
              <span className={`text-xs font-medium ${active ? "text-foreground" : "text-muted-foreground/50"}`}>
                {label}
              </span>
            </div>
            {i < labels.length - 1 && (
              <div className="mx-3 h-px w-8 bg-border/60" />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────
export default function BillingPreparePage() {
  const router = useRouter();

  // Step 1
  const [cutters,  setCutters]  = useState<Cutter[]>([]);
  const [cutterId, setCutterId] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd,   setPeriodEnd]   = useState("");
  const [step1Notes,  setStep1Notes]  = useState("");

  // Step 2
  const [clips,       setClips]       = useState<EligibleClip[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loadingClips, setLoadingClips] = useState(false);
  const [clipError,    setClipError]   = useState<string | null>(null);
  const [ratePer1k,    setRatePer1k]   = useState<number | null>(null);
  const [currency,     setCurrency]    = useState("EUR");

  // Step 3 / general
  const [step,    setStep]    = useState(1);
  const [creating, setCreating] = useState(false);
  const [error,    setError]   = useState<string | null>(null);
  const [loading,  setLoading] = useState(true);

  // Load cutters (from profiles endpoint)
  useEffect(() => {
    async function loadCutters() {
      const res = await fetch("/api/ops/billing/profiles");
      if (res.status === 401) { router.push("/login"); return; }
      if (res.status === 403) { router.push("/dashboard"); return; }
      const data = await res.json();
      setCutters((data.profiles ?? []).map((p: {
        cutter_id: string; cutter_name: string;
        has_profile: boolean; rate_per_1k: number | null;
        rate_per_view_legacy: number | null; currency: string;
      }) => ({
        id:          p.cutter_id,
        name:        p.cutter_name,
        has_profile: p.has_profile || (p.rate_per_view_legacy != null && p.rate_per_view_legacy > 0),
        rate_per_1k: p.rate_per_1k ?? (p.rate_per_view_legacy != null ? p.rate_per_view_legacy * 1000 : null),
        currency:    p.currency ?? "EUR",
      })));
      setLoading(false);
    }
    loadCutters();
  }, [router]);

  // Step 1 → Step 2: load eligible clips
  async function goToStep2() {
    if (!cutterId) { setError("Bitte einen Cutter auswählen."); return; }
    setError(null);
    setLoadingClips(true);
    setStep(2);

    const params = new URLSearchParams({ cutter_id: cutterId });
    if (periodStart) params.set("period_start", periodStart);
    if (periodEnd)   params.set("period_end",   periodEnd);

    const res = await fetch(`/api/ops/billing/eligible?${params}`);
    setLoadingClips(false);
    if (!res.ok) {
      const d = await res.json();
      setClipError(d.error ?? "Fehler beim Laden der Clips.");
      return;
    }
    const data = await res.json();
    setClips(data.clips ?? []);
    setSelectedIds(new Set((data.clips ?? []).map((c: EligibleClip) => c.id)));

    // Get rate from selected cutter
    const cutter = cutters.find(c => c.id === cutterId);
    setRatePer1k(cutter?.rate_per_1k ?? null);
    setCurrency(cutter?.currency ?? "EUR");
  }

  // Step 2 → Step 3 (create batch)
  async function createBatch() {
    if (selectedIds.size === 0) { setError("Mindestens ein Clip muss ausgewählt sein."); return; }
    setError(null);
    setCreating(true);

    const res = await fetch("/api/ops/billing/batches", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        cutter_id:    cutterId,
        clip_ids:     Array.from(selectedIds),
        period_start: periodStart || undefined,
        period_end:   periodEnd   || undefined,
        notes:        step1Notes  || undefined,
      }),
    });

    setCreating(false);
    if (!res.ok) {
      const d = await res.json();
      setError(d.error ?? "Fehler beim Erstellen des Batches.");
      return;
    }
    const data = await res.json();
    router.push(`/ops/billing/batches/${data.id}`);
  }

  // Toggle all
  function toggleAll() {
    if (selectedIds.size === clips.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(clips.map(c => c.id)));
    }
  }

  function toggleClip(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedIds(next);
  }

  // Estimated amount for selected clips
  const selectedClips    = clips.filter(c => selectedIds.has(c.id));
  const totalBillViews   = selectedClips.reduce((s, c) => s + c.billable_views, 0);
  const estimatedAmount  = ratePer1k != null ? (totalBillViews / 1000) * ratePer1k : null;
  const selectedCutter   = cutters.find(c => c.id === cutterId);

  return (
    <>
      <CutterNav />
      <main className="mx-auto max-w-5xl px-6 py-8 space-y-6">

        {/* Header */}
        <div>
          <Link
            href="/ops/billing"
            className="mb-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Zurück zur Abrechnung
          </Link>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Neuer Abrechnungs-Batch</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Cutter auswählen, fällige Clips prüfen, Batch erstellen.
              </p>
            </div>
          </div>
        </div>

        {/* Step indicator */}
        <Steps step={step} />

        {/* ── Step 1: Cutter + Period ── */}
        {step === 1 && (
          <div className="rounded-xl border border-border bg-card p-6 space-y-5">
            <h2 className="text-sm font-semibold">1. Cutter & Zeitraum</h2>

            {loading ? (
              <div className="flex items-center gap-2 text-muted-foreground/40 text-sm py-6 justify-center">
                <RefreshCw className="h-4 w-4 animate-spin" />
                Lade Cutter…
              </div>
            ) : (
              <>
                {/* Cutter select */}
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-2">Cutter *</label>
                  <select
                    value={cutterId}
                    onChange={e => setCutterId(e.target.value)}
                    className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
                  >
                    <option value="">— Cutter wählen —</option>
                    {cutters.map(c => (
                      <option key={c.id} value={c.id} disabled={!c.has_profile}>
                        {c.name}{!c.has_profile ? " (kein Tarif)" : c.rate_per_1k ? ` — ${c.rate_per_1k.toFixed(2)} ${c.currency}/1k` : ""}
                      </option>
                    ))}
                  </select>
                  {cutterId && !selectedCutter?.has_profile && (
                    <p className="mt-1 text-xs text-yellow-400">
                      Dieser Cutter hat keinen Tarif.{" "}
                      <Link href="/ops/billing/profiles" className="underline">Tarif anlegen →</Link>
                    </p>
                  )}
                </div>

                {/* Period */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-2">
                      Zeitraum von <span className="text-muted-foreground/50">(optional)</span>
                    </label>
                    <input
                      type="date"
                      value={periodStart}
                      onChange={e => setPeriodStart(e.target.value)}
                      className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-2">Bis</label>
                    <input
                      type="date"
                      value={periodEnd}
                      onChange={e => setPeriodEnd(e.target.value)}
                      className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
                    />
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-2">
                    Interne Notiz <span className="text-muted-foreground/50">(optional)</span>
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Notiz zum Batch…"
                    value={step1Notes}
                    onChange={e => setStep1Notes(e.target.value)}
                    className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm placeholder:text-muted-foreground/30 focus:outline-none focus:ring-1 focus:ring-primary/50 resize-none"
                  />
                </div>

                {error && (
                  <div className="flex items-center gap-2 text-xs text-red-400">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {error}
                  </div>
                )}

                <div className="flex justify-end">
                  <button
                    onClick={goToStep2}
                    disabled={!cutterId}
                    className="flex items-center gap-1.5 rounded-md bg-primary/10 border border-primary/20 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/15 disabled:opacity-40 transition-colors"
                  >
                    Weiter: Clips laden
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Step 2: Clip review ── */}
        {step === 2 && (
          <div className="space-y-4">
            {/* Info bar */}
            <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card px-5 py-3.5">
              <div className="text-sm">
                <span className="font-medium">{selectedCutter?.name}</span>
                <span className="text-muted-foreground mx-2">·</span>
                <span className="text-muted-foreground text-xs">
                  {ratePer1k != null ? `${ratePer1k.toFixed(2)} ${currency}/1k Views` : "Kein Tarif"}
                </span>
                {(periodStart || periodEnd) && (
                  <>
                    <span className="text-muted-foreground mx-2">·</span>
                    <span className="text-muted-foreground text-xs">
                      {periodStart ? fmtDate(periodStart) : "Anfang"} – {periodEnd ? fmtDate(periodEnd) : "Heute"}
                    </span>
                  </>
                )}
              </div>
              <button
                onClick={() => { setStep(1); setClips([]); setSelectedIds(new Set()); }}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                ← Zurück
              </button>
            </div>

            {/* Loading clips */}
            {loadingClips && (
              <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground/40">
                <RefreshCw className="h-4 w-4 animate-spin" />
                <span className="text-sm">Lade fällige Clips…</span>
              </div>
            )}

            {clipError && !loadingClips && (
              <div className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-400">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {clipError}
              </div>
            )}

            {!loadingClips && !clipError && clips.length === 0 && (
              <div className="flex flex-col items-center py-16 gap-2 text-center">
                <Eye className="h-8 w-8 text-muted-foreground/15" />
                <p className="text-sm text-muted-foreground">Keine fälligen Clips für diesen Cutter.</p>
                <p className="text-xs text-muted-foreground/60">
                  Clips sind fällig wenn: verifizierte Views {'>'} bereits abgerechnete Views.
                </p>
              </div>
            )}

            {!loadingClips && clips.length > 0 && (
              <>
                {/* Summary bar */}
                <div className="flex items-center justify-between gap-4 text-sm">
                  <div className="flex items-center gap-4">
                    <span className="text-muted-foreground">
                      <span className="font-medium text-foreground">{selectedIds.size}</span> / {clips.length} Clips ausgewählt
                    </span>
                    <span className="text-muted-foreground">
                      <span className="font-medium text-foreground">{fmt(totalBillViews)}</span> Abrechnungs-Views
                    </span>
                    {estimatedAmount != null && (
                      <span className="font-semibold text-emerald-400">{eur(estimatedAmount)}</span>
                    )}
                  </div>
                  <button
                    onClick={toggleAll}
                    className="text-xs text-primary hover:text-primary/80 transition-colors"
                  >
                    {selectedIds.size === clips.length ? "Alle abwählen" : "Alle auswählen"}
                  </button>
                </div>

                {/* Clips table */}
                <div className="rounded-xl border border-border bg-card overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="w-10 px-4 py-3" />
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Clip</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Plattform</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide">Verif. Views</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide">Bereits abger.</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide">Fällig</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide">Betrag</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {clips.map(c => {
                        const checked = selectedIds.has(c.id);
                        const amount  = ratePer1k != null ? (c.billable_views / 1000) * ratePer1k : null;
                        return (
                          <tr
                            key={c.id}
                            onClick={() => toggleClip(c.id)}
                            className={`cursor-pointer transition-colors ${checked ? "hover:bg-accent/20" : "opacity-40 hover:opacity-60 hover:bg-accent/10"}`}
                          >
                            <td className="px-4 py-3">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleClip(c.id)}
                                onClick={e => e.stopPropagation()}
                                className="rounded border-border"
                              />
                            </td>
                            <td className="px-4 py-3">
                              <p className="font-medium text-sm leading-tight line-clamp-1">{c.title ?? "Kein Titel"}</p>
                              <p className="text-xs text-muted-foreground mt-0.5">{fmtDate(c.clip_date)}</p>
                            </td>
                            <td className="px-4 py-3"><PlatformBadge p={c.platform} /></td>
                            <td className="px-4 py-3 text-right tabular-nums text-sm">{fmt(c.verified_views)}</td>
                            <td className="px-4 py-3 text-right tabular-nums text-sm text-muted-foreground">{fmt(c.billed_baseline)}</td>
                            <td className="px-4 py-3 text-right tabular-nums text-sm font-semibold">{fmt(c.billable_views)}</td>
                            <td className="px-4 py-3 text-right tabular-nums text-sm text-emerald-400">
                              {amount != null ? eur(amount) : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    {/* Footer totals */}
                    {selectedIds.size > 0 && (
                      <tfoot>
                        <tr className="border-t-2 border-border bg-muted/10">
                          <td colSpan={5} className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                            Ausgewählt ({selectedIds.size} Clips)
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums font-bold">{fmt(totalBillViews)}</td>
                          <td className="px-4 py-3 text-right tabular-nums font-bold text-emerald-400">
                            {estimatedAmount != null ? eur(estimatedAmount) : "—"}
                          </td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>

                {error && (
                  <div className="flex items-center gap-2 text-xs text-red-400">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {error}
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => { setStep(1); setClips([]); setSelectedIds(new Set()); }}
                    className="rounded-md border border-border px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  >
                    ← Zurück
                  </button>
                  <button
                    onClick={createBatch}
                    disabled={creating || selectedIds.size === 0}
                    className="flex items-center gap-2 rounded-md bg-primary/10 border border-primary/20 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/15 disabled:opacity-40 transition-colors"
                  >
                    {creating && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                    <Receipt className="h-3.5 w-3.5" />
                    Batch erstellen ({selectedIds.size} Clips)
                  </button>
                </div>
              </>
            )}
          </div>
        )}

      </main>
    </>
  );
}
