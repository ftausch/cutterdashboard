"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { CutterNav } from "@/components/cutter-nav";
import {
  RefreshCw, ChevronLeft, CheckCircle2, FileCheck, FileOutput,
  XCircle, Clock, AlertTriangle, Eye, EyeOff,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────
interface Batch {
  id: string;
  cutter_id: string | null;
  cutter_name: string | null;
  period_start: string | null;
  period_end:   string | null;
  status: string;
  rate_per_1k: number | null;
  currency: string;
  total_clips: number;
  total_billable_views: number;
  total_amount: number;
  notes: string | null;
  created_by_name: string | null;
  created_at: string | null;
  updated_at: string | null;
  reviewed_at: string | null;
  reviewed_by_name: string | null;
  finalized_at: string | null;
  finalized_by_name: string | null;
  exported_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
}

interface Item {
  id: string;
  clip_id: string | null;
  clip_url: string | null;
  clip_title: string | null;
  platform: string | null;
  billed_baseline: number;
  snapshot_views: number;
  billable_views: number;
  rate_per_1k: number | null;
  amount: number;
  is_included: boolean;
  excluded_reason: string | null;
  current_views: number | null;
  verification_status: string | null;
  proof_status: string | null;
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
  return new Date(iso).toLocaleDateString("de-DE", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

const STATUS_CFG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  draft:     { label: "Entwurf",       color: "text-muted-foreground border-border bg-muted/20",            icon: Clock       },
  reviewed:  { label: "Geprüft",       color: "text-blue-400 border-blue-500/20 bg-blue-500/8",             icon: FileCheck   },
  finalized: { label: "Abgeschlossen", color: "text-emerald-400 border-emerald-500/20 bg-emerald-500/8",    icon: CheckCircle2 },
  exported:  { label: "Exportiert",    color: "text-purple-400 border-purple-500/20 bg-purple-500/8",       icon: FileOutput  },
  cancelled: { label: "Storniert",     color: "text-red-400 border-red-500/20 bg-red-500/8",                icon: XCircle     },
};

function StatusBadge({ status }: { status: string }) {
  const cfg  = STATUS_CFG[status] ?? STATUS_CFG.draft;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium ${cfg.color}`}>
      <Icon className="h-3.5 w-3.5" />
      {cfg.label}
    </span>
  );
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

// ── Cancel confirmation ────────────────────────────────────────────────
function CancelBox({ onConfirm, onClose }: { onConfirm: (reason: string) => void; onClose: () => void }) {
  const [reason, setReason] = useState("");
  return (
    <div className="mt-3 rounded-lg border border-red-500/20 bg-red-500/5 p-4 space-y-3">
      <p className="text-sm font-medium text-red-300">Batch stornieren?</p>
      <p className="text-xs text-red-400/70">
        Alle enthaltenen Clips werden wieder als fällig markiert. Diese Aktion ist nicht rückgängig zu machen.
      </p>
      <textarea
        rows={2}
        placeholder="Grund (optional)…"
        value={reason}
        onChange={e => setReason(e.target.value)}
        className="w-full rounded-md border border-red-500/20 bg-red-500/5 px-3 py-2 text-sm placeholder:text-red-500/30 focus:outline-none focus:ring-1 focus:ring-red-500/30 resize-none"
      />
      <div className="flex gap-2">
        <button
          onClick={() => onConfirm(reason)}
          className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/20 transition-colors"
        >
          Ja, stornieren
        </button>
        <button
          onClick={onClose}
          className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          Abbrechen
        </button>
      </div>
    </div>
  );
}

// ── Exclude modal (inline) ─────────────────────────────────────────────
function ExcludeReason({ onSave, onCancel }: { onSave: (r: string) => void; onCancel: () => void }) {
  const [r, setR] = useState("");
  return (
    <div className="flex items-center gap-2 mt-1">
      <input
        type="text"
        placeholder="Ausschluss-Grund…"
        value={r}
        onChange={e => setR(e.target.value)}
        className="flex-1 rounded-md border border-border bg-card px-2 py-1 text-xs placeholder:text-muted-foreground/30 focus:outline-none focus:ring-1 focus:ring-primary/50"
        autoFocus
      />
      <button onClick={() => onSave(r)} className="text-xs text-primary hover:text-primary/80">OK</button>
      <button onClick={onCancel} className="text-xs text-muted-foreground hover:text-foreground">✕</button>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────
export default function BatchDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id     = params.id;

  const [batch,    setBatch]    = useState<Batch | null>(null);
  const [items,    setItems]    = useState<Item[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [actioning, setActioning] = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [showCancel, setShowCancel] = useState(false);
  const [excludeItemId, setExcludeItemId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/ops/billing/batches/${id}`);
      if (res.status === 401) { router.push("/login"); return; }
      if (res.status === 404) { router.push("/ops/billing"); return; }
      const data = await res.json();
      setBatch(data.batch);
      setItems(data.items ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [id]);

  async function doAction(action: string, extra?: Record<string, string>) {
    setError(null);
    setActioning(true);
    const res = await fetch(`/api/ops/billing/batches/${id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ action, ...extra }),
    });
    setActioning(false);
    if (!res.ok) {
      const d = await res.json();
      setError(d.error ?? "Fehler bei der Aktion.");
      return;
    }
    await load();
    setShowCancel(false);
  }

  async function toggleItem(item: Item, reason?: string) {
    const newIncluded = !item.is_included;
    const res = await fetch(`/api/ops/billing/batches/${id}/items/${item.id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        is_included:     newIncluded,
        excluded_reason: newIncluded ? null : (reason ?? null),
      }),
    });
    if (!res.ok) {
      const d = await res.json();
      setError(d.error ?? "Fehler beim Aktualisieren.");
      return;
    }
    const data = await res.json();
    // Update local state
    setItems(prev => prev.map(it => it.id === item.id
      ? { ...it, is_included: newIncluded, excluded_reason: newIncluded ? null : (reason ?? null) }
      : it
    ));
    if (batch) {
      setBatch(prev => prev ? {
        ...prev,
        total_clips:          data.total_clips,
        total_billable_views: data.total_billable_views,
        total_amount:         data.total_amount,
      } : prev);
    }
    setExcludeItemId(null);
  }

  const canModify  = batch?.status === "draft" || batch?.status === "reviewed";
  const canReview  = batch?.status === "draft";
  const canFinalize = batch?.status === "reviewed";
  const canExport  = batch?.status === "finalized";
  const canCancel  = ["draft", "reviewed", "finalized"].includes(batch?.status ?? "");

  if (loading) {
    return (
      <>
        <CutterNav />
        <main className="mx-auto max-w-5xl px-6 py-8">
          <div className="flex items-center justify-center py-24 gap-2 text-muted-foreground/40">
            <RefreshCw className="h-4 w-4 animate-spin" />
            <span className="text-sm">Lade Batch…</span>
          </div>
        </main>
      </>
    );
  }

  if (!batch) return null;

  const includedItems  = items.filter(it => it.is_included);
  const excludedItems  = items.filter(it => !it.is_included);

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
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-semibold tracking-tight">
                  {batch.cutter_name ?? "—"} — Batch
                </h1>
                <StatusBadge status={batch.status} />
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {batch.period_start
                  ? `${fmtDate(batch.period_start).split(",")[0]} – ${fmtDate(batch.period_end).split(",")[0]}`
                  : "Kein Zeitraum angegeben"
                }
                {" · "}
                Erstellt von {batch.created_by_name ?? "—"} am {fmtDate(batch.created_at).split(",")[0]}
              </p>
            </div>
            <button
              onClick={load}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-40 transition-colors"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              Aktualisieren
            </button>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-2xl font-bold tabular-nums leading-none">{batch.total_clips}</p>
            <p className="mt-1.5 text-xs text-muted-foreground">Enthaltene Clips</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-2xl font-bold tabular-nums leading-none">{fmt(batch.total_billable_views)}</p>
            <p className="mt-1.5 text-xs text-muted-foreground">Abrechnungs-Views</p>
          </div>
          <div className="rounded-lg border border-emerald-500/20 bg-card p-4">
            <p className="text-2xl font-bold tabular-nums leading-none text-emerald-400">{eur(batch.total_amount)}</p>
            <p className="mt-1.5 text-xs text-muted-foreground">
              Gesamtbetrag · {batch.rate_per_1k?.toFixed(2)} {batch.currency}/1k
            </p>
          </div>
        </div>

        {/* Notes */}
        {batch.notes && (
          <div className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
            <span className="font-medium text-foreground/60 text-xs uppercase tracking-wide">Notiz: </span>
            {batch.notes}
          </div>
        )}

        {/* Cancelled notice */}
        {batch.status === "cancelled" && (
          <div className="flex items-start gap-3 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3">
            <XCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-red-300">Batch wurde storniert</p>
              {batch.cancel_reason && (
                <p className="text-xs text-red-400/70 mt-0.5">Grund: {batch.cancel_reason}</p>
              )}
              <p className="text-xs text-red-400/50 mt-0.5">{fmtDate(batch.cancelled_at)}</p>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-400">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Action buttons */}
        {batch.status !== "cancelled" && batch.status !== "exported" && (
          <div className="flex flex-wrap items-center gap-3">
            {canReview && (
              <button
                onClick={() => doAction("review")}
                disabled={actioning}
                className="flex items-center gap-1.5 rounded-md border border-blue-500/20 bg-blue-500/8 px-3 py-1.5 text-xs font-medium text-blue-400 hover:bg-blue-500/15 disabled:opacity-40 transition-colors"
              >
                {actioning ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <FileCheck className="h-3.5 w-3.5" />}
                Als geprüft markieren
              </button>
            )}
            {canFinalize && (
              <button
                onClick={() => doAction("finalize")}
                disabled={actioning}
                className="flex items-center gap-1.5 rounded-md border border-emerald-500/20 bg-emerald-500/8 px-3 py-1.5 text-xs font-medium text-emerald-400 hover:bg-emerald-500/15 disabled:opacity-40 transition-colors"
              >
                {actioning ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                Finalisieren & Clips abrechnen
              </button>
            )}
            {canExport && (
              <button
                onClick={() => doAction("export")}
                disabled={actioning}
                className="flex items-center gap-1.5 rounded-md border border-purple-500/20 bg-purple-500/8 px-3 py-1.5 text-xs font-medium text-purple-400 hover:bg-purple-500/15 disabled:opacity-40 transition-colors"
              >
                {actioning ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <FileOutput className="h-3.5 w-3.5" />}
                Als exportiert markieren
              </button>
            )}
            {canCancel && !showCancel && (
              <button
                onClick={() => setShowCancel(true)}
                className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-red-400 hover:border-red-500/20 transition-colors ml-auto"
              >
                <XCircle className="h-3.5 w-3.5" />
                Stornieren
              </button>
            )}
          </div>
        )}

        {/* Cancel confirmation */}
        {showCancel && (
          <CancelBox
            onConfirm={(reason) => doAction("cancel", { cancel_reason: reason })}
            onClose={() => setShowCancel(false)}
          />
        )}

        {/* Timeline */}
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground/60">
          {batch.reviewed_at && (
            <span>Geprüft: {fmtDate(batch.reviewed_at)} von {batch.reviewed_by_name ?? "—"}</span>
          )}
          {batch.finalized_at && (
            <span>Finalisiert: {fmtDate(batch.finalized_at)} von {batch.finalized_by_name ?? "—"}</span>
          )}
          {batch.exported_at && (
            <span>Exportiert: {fmtDate(batch.exported_at)}</span>
          )}
        </div>

        {/* Items table — included */}
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/50">
            Enthaltene Clips ({includedItems.length})
          </h2>
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            {includedItems.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">Keine enthaltenen Clips.</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Clip</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Plattform</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide">Snapshot</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide">Bereits abger.</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide">Fällig</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide">Betrag</th>
                    {canModify && <th className="w-10 px-4 py-3" />}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {includedItems.map(item => (
                    <tr key={item.id} className="hover:bg-accent/10 transition-colors">
                      <td className="px-5 py-3.5">
                        {item.clip_url ? (
                          <a href={item.clip_url} target="_blank" rel="noopener noreferrer"
                            className="font-medium hover:text-primary transition-colors line-clamp-1">
                            {item.clip_title ?? "Kein Titel"}
                          </a>
                        ) : (
                          <span className="font-medium line-clamp-1">{item.clip_title ?? "Kein Titel"}</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5"><PlatformBadge p={item.platform} /></td>
                      <td className="px-4 py-3.5 text-right tabular-nums">{fmt(item.snapshot_views)}</td>
                      <td className="px-4 py-3.5 text-right tabular-nums text-muted-foreground">{fmt(item.billed_baseline)}</td>
                      <td className="px-4 py-3.5 text-right tabular-nums font-semibold">{fmt(item.billable_views)}</td>
                      <td className="px-4 py-3.5 text-right tabular-nums text-emerald-400">{eur(item.amount)}</td>
                      {canModify && (
                        <td className="px-4 py-3.5">
                          <div>
                            <button
                              onClick={() => setExcludeItemId(prev => prev === item.id ? null : item.id)}
                              className="text-muted-foreground/40 hover:text-red-400 transition-colors"
                              title="Ausschließen"
                            >
                              <EyeOff className="h-3.5 w-3.5" />
                            </button>
                            {excludeItemId === item.id && (
                              <ExcludeReason
                                onSave={(r) => toggleItem(item, r)}
                                onCancel={() => setExcludeItemId(null)}
                              />
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

        {/* Excluded items */}
        {excludedItems.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/50">
              Ausgeschlossen ({excludedItems.length})
            </h2>
            <div className="rounded-xl border border-border bg-card overflow-hidden opacity-60">
              <table className="w-full text-sm">
                <tbody className="divide-y divide-border/40">
                  {excludedItems.map(item => (
                    <tr key={item.id} className="hover:bg-accent/10 transition-colors">
                      <td className="px-5 py-3">
                        <span className="font-medium line-clamp-1 text-muted-foreground">
                          {item.clip_title ?? "Kein Titel"}
                        </span>
                        {item.excluded_reason && (
                          <p className="text-xs text-muted-foreground/50 mt-0.5">Grund: {item.excluded_reason}</p>
                        )}
                      </td>
                      <td className="px-4 py-3"><PlatformBadge p={item.platform} /></td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground text-xs">{fmt(item.billable_views)} Views</td>
                      {canModify && (
                        <td className="px-4 py-3">
                          <button
                            onClick={() => toggleItem(item)}
                            className="text-muted-foreground/40 hover:text-emerald-400 transition-colors"
                            title="Wieder einschließen"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

      </main>
    </>
  );
}
