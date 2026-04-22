"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CutterNav } from "@/components/cutter-nav";
import { RefreshCw, Receipt, AlertTriangle, CheckCircle2, Clock, Users } from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────
interface CutterBilling {
  id: string;
  name: string;
  email: string;
  rate_per_view: number;
  total_clips: number;
  verified_clips: number;
  unbilled_views: number;
  total_current_views: number;
  pending_proof_count: number;
  overdue_proof_count: number;
  last_invoice_at: string | null;
  estimated_amount: number;
  is_ready: boolean;
  is_blocked: boolean;
}

interface GrandTotal {
  total_cutters: number;
  ready_cutters: number;
  total_unbilled: number;
  total_amount: number;
  total_pending_proof: number;
}

interface BillingData {
  cutters: CutterBilling[];
  grandTotal: GrandTotal;
}

// ── Helpers ──────────────────────────────────────────────────────────
function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  return new Intl.NumberFormat("de-DE").format(n);
}

function formatEur(n: number): string {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(n);
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatRelativeDate(iso: string | null): string {
  if (!iso) return "noch nie";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days === 0) return "heute";
  if (days === 1) return "gestern";
  if (days < 30)  return `vor ${days}T`;
  if (days < 60)  return "vor ~1 Monat";
  return `vor ${Math.floor(days / 30)} Monaten`;
}

// ── Readiness badge ──────────────────────────────────────────────────
function ReadinessBadge({ cutter }: { cutter: CutterBilling }) {
  if (cutter.unbilled_views === 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/20 px-2 py-0.5 text-xs text-muted-foreground/50">
        Kein Guthaben
      </span>
    );
  }
  if (cutter.is_blocked) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-yellow-500/20 bg-yellow-500/8 px-2 py-0.5 text-xs text-yellow-400">
        <AlertTriangle className="h-3 w-3" />
        {cutter.pending_proof_count} Beleg ausstehend
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/20 bg-emerald-500/8 px-2 py-0.5 text-xs text-emerald-400">
      <CheckCircle2 className="h-3 w-3" />
      Bereit
    </span>
  );
}

// ── Page ─────────────────────────────────────────────────────────────
export default function BillingPrepPage() {
  const router  = useRouter();
  const [data,    setData]    = useState<BillingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter,  setFilter]  = useState<"all" | "ready" | "blocked">("all");

  async function load() {
    setLoading(true);
    const res = await fetch("/api/ops/billing-prep");
    if (res.status === 401) { router.push("/login"); return; }
    if (res.status === 403) { router.push("/dashboard"); return; }
    setData(await res.json());
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const cutters = (data?.cutters ?? []).filter(c => {
    if (filter === "ready")   return c.is_ready;
    if (filter === "blocked") return c.is_blocked;
    return true;
  });

  const gt = data?.grandTotal;

  return (
    <>
      <CutterNav />
      <main className="mx-auto max-w-6xl px-6 py-8 space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Abrechnungsvorbereitung</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Welche Cutter haben unabgerechnete Views — und wie viel ist fällig?
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

        {/* KPI summary */}
        {gt && (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="mb-2 text-muted-foreground/40"><Users className="h-4 w-4" /></div>
              <p className="text-2xl font-bold tabular-nums leading-none">{gt.ready_cutters}<span className="text-muted-foreground text-sm font-normal ml-1">/ {gt.total_cutters}</span></p>
              <p className="mt-1.5 text-xs text-muted-foreground">Cutter bereit</p>
            </div>
            <div className="rounded-lg border border-emerald-500/20 bg-card p-4">
              <div className="mb-2 text-emerald-400/40"><Receipt className="h-4 w-4" /></div>
              <p className="text-2xl font-bold tabular-nums leading-none text-emerald-400">{formatNum(gt.total_unbilled)}</p>
              <p className="mt-1.5 text-xs text-muted-foreground">Unabgerechnete Views</p>
            </div>
            <div className="rounded-lg border border-emerald-500/20 bg-card p-4">
              <div className="mb-2 text-emerald-400/40"><Receipt className="h-4 w-4" /></div>
              <p className="text-2xl font-bold tabular-nums leading-none text-emerald-400">{formatEur(gt.total_amount)}</p>
              <p className="mt-1.5 text-xs text-muted-foreground">Geschätzter Gesamtbetrag</p>
            </div>
            {gt.total_pending_proof > 0 ? (
              <div className="rounded-lg border border-yellow-500/20 bg-card p-4">
                <div className="mb-2 text-yellow-400/40"><AlertTriangle className="h-4 w-4" /></div>
                <p className="text-2xl font-bold tabular-nums leading-none text-yellow-400">{gt.total_pending_proof}</p>
                <p className="mt-1.5 text-xs text-muted-foreground">Belege ausstehend (Blocker)</p>
              </div>
            ) : (
              <div className="rounded-lg border border-border bg-card p-4">
                <div className="mb-2 text-muted-foreground/40"><CheckCircle2 className="h-4 w-4" /></div>
                <p className="text-2xl font-bold tabular-nums leading-none text-emerald-400">0</p>
                <p className="mt-1.5 text-xs text-muted-foreground">Keine Blocker</p>
              </div>
            )}
          </div>
        )}

        {/* Filter tabs */}
        <div className="flex gap-1 border-b border-border">
          {(["all", "ready", "blocked"] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                filter === f
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground/60 hover:text-muted-foreground"
              }`}
            >
              {f === "all" ? "Alle" : f === "ready" ? "Bereit" : "Ausstehend"}
            </button>
          ))}
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-20 text-muted-foreground/40 gap-2">
            <RefreshCw className="h-4 w-4 animate-spin" />
            <span className="text-sm">Lade Abrechnungsdaten…</span>
          </div>
        )}

        {/* Table */}
        {!loading && (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            {cutters.length === 0 ? (
              <div className="flex flex-col items-center py-16 text-center gap-2">
                <Receipt className="h-8 w-8 text-muted-foreground/15 mb-1" />
                <p className="text-sm text-muted-foreground">Keine Cutter in dieser Ansicht.</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Cutter</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide">Verifiziert</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide">Unabger. Views</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide">Rate</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide">Est. Betrag</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Letzte Rechnung</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {cutters.map(c => (
                    <tr key={c.id} className={`hover:bg-accent/20 transition-colors ${c.unbilled_views === 0 ? "opacity-40" : ""}`}>
                      <td className="px-5 py-3.5">
                        <p className="font-medium">{c.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{c.email}</p>
                      </td>
                      <td className="px-4 py-3.5 text-right tabular-nums text-muted-foreground">
                        {c.verified_clips}<span className="text-muted-foreground/40">/{c.total_clips}</span>
                      </td>
                      <td className="px-4 py-3.5 text-right tabular-nums">
                        {c.unbilled_views > 0
                          ? <span className="font-semibold text-foreground">{formatNum(c.unbilled_views)}</span>
                          : <span className="text-muted-foreground/30">—</span>
                        }
                      </td>
                      <td className="px-4 py-3.5 text-right tabular-nums text-muted-foreground text-xs">
                        {c.rate_per_view > 0
                          ? `€${c.rate_per_view.toFixed(4)}/View`
                          : "—"
                        }
                      </td>
                      <td className="px-4 py-3.5 text-right tabular-nums">
                        {c.estimated_amount > 0
                          ? <span className="font-semibold text-emerald-400">{formatEur(c.estimated_amount)}</span>
                          : <span className="text-muted-foreground/30">—</span>
                        }
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="text-xs text-muted-foreground" title={formatDate(c.last_invoice_at)}>
                          {formatRelativeDate(c.last_invoice_at)}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          <ReadinessBadge cutter={c} />
                          {c.overdue_proof_count > 0 && (
                            <span className="inline-flex items-center gap-1 rounded-md border border-orange-500/20 bg-orange-500/8 px-2 py-0.5 text-xs text-orange-400">
                              <Clock className="h-3 w-3" />
                              {c.overdue_proof_count} überfällig
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>

                {/* Grand total footer */}
                {cutters.length > 1 && (
                  <tfoot>
                    <tr className="border-t-2 border-border bg-muted/10">
                      <td className="px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Gesamt ({cutters.length} Cutter)
                      </td>
                      <td className="px-4 py-3" />
                      <td className="px-4 py-3 text-right tabular-nums font-bold">
                        {formatNum(cutters.reduce((s, c) => s + c.unbilled_views, 0))}
                      </td>
                      <td className="px-4 py-3" />
                      <td className="px-4 py-3 text-right tabular-nums font-bold text-emerald-400">
                        {formatEur(cutters.reduce((s, c) => s + c.estimated_amount, 0))}
                      </td>
                      <td className="px-4 py-3" />
                      <td className="px-4 py-3">
                        <span className="text-xs text-muted-foreground">
                          {cutters.filter(c => c.is_ready).length} bereit · {cutters.filter(c => c.is_blocked).length} ausstehend
                        </span>
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            )}
          </div>
        )}

        {/* Note */}
        <p className="text-xs text-muted-foreground/50">
          Beträge sind Schätzungen basierend auf dem aktuellen Rate und unabgerechneten verifizierten Views.
          Tatsächliche Rechnungsbeträge können abweichen (z.B. bei nachträglichen View-Korrekturen).
          Rechnungen werden von den Cuttern selbst über ihre Rechnungsseite erstellt.
        </p>

      </main>
    </>
  );
}
