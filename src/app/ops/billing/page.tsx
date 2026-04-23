"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CutterNav } from "@/components/cutter-nav";
import {
  RefreshCw, Receipt, Wallet, Settings2, Plus,
  CheckCircle2, Clock, XCircle, FileCheck, FileOutput,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────
interface BatchSummary {
  draft:     { count: number; amount: number };
  reviewed:  { count: number; amount: number };
  finalized: { count: number; amount: number };
  exported:  { count: number; amount: number };
  cancelled: { count: number; amount: number };
}

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
  created_by_name: string | null;
  created_at: string | null;
  finalized_at: string | null;
  exported_at:  string | null;
  cancelled_at: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────
function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return new Intl.NumberFormat("de-DE").format(n);
  return String(n);
}
function eur(n: number): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency", currency: "EUR", maximumFractionDigits: 2,
  }).format(n);
}
function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("de-DE", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });
}

const STATUS_CFG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  draft:     { label: "Entwurf",     color: "text-muted-foreground border-border bg-muted/20",               icon: Clock       },
  reviewed:  { label: "Geprüft",     color: "text-blue-400 border-blue-500/20 bg-blue-500/8",                icon: FileCheck   },
  finalized: { label: "Abgeschlossen", color: "text-emerald-400 border-emerald-500/20 bg-emerald-500/8",     icon: CheckCircle2 },
  exported:  { label: "Exportiert",  color: "text-purple-400 border-purple-500/20 bg-purple-500/8",          icon: FileOutput  },
  cancelled: { label: "Storniert",   color: "text-red-400 border-red-500/20 bg-red-500/8",                   icon: XCircle     },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CFG[status] ?? STATUS_CFG.draft;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium ${cfg.color}`}>
      <Icon className="h-3 w-3" />
      {cfg.label}
    </span>
  );
}

// ── Page ──────────────────────────────────────────────────────────────
export default function BillingOverviewPage() {
  const router = useRouter();
  const [batches,  setBatches]  = useState<Batch[]>([]);
  const [summary,  setSummary]  = useState<Partial<BatchSummary>>({});
  const [loading,  setLoading]  = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/ops/billing/batches");
      if (res.status === 401) { router.push("/login"); return; }
      if (res.status === 403) { router.push("/dashboard"); return; }
      const data = await res.json();
      setBatches(data.batches ?? []);
      setSummary(data.summary ?? {});
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const visible = statusFilter === "all"
    ? batches
    : batches.filter(b => b.status === statusFilter);

  const totalPending = (summary.draft?.count ?? 0) + (summary.reviewed?.count ?? 0);
  const totalPendingAmt = (summary.draft?.amount ?? 0) + (summary.reviewed?.amount ?? 0);

  return (
    <>
      <CutterNav />
      <main className="mx-auto max-w-6xl px-6 py-8 space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Abrechnung</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Übersicht aller Abrechnungs-Batches — erstellen, prüfen, finalisieren.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={load}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-40 transition-colors"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              Aktualisieren
            </button>
            <Link
              href="/ops/billing/profiles"
              className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <Settings2 className="h-3.5 w-3.5" />
              Tarife
            </Link>
            <Link
              href="/ops/billing/prepare"
              className="flex items-center gap-1.5 rounded-md bg-primary/10 border border-primary/20 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/15 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Neuer Batch
            </Link>
          </div>
        </div>

        {/* KPI tiles */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="mb-2 text-muted-foreground/40"><Wallet className="h-4 w-4" /></div>
            <p className="text-2xl font-bold tabular-nums leading-none">{totalPending}</p>
            <p className="mt-1.5 text-xs text-muted-foreground">Offene Batches</p>
          </div>
          <div className="rounded-lg border border-emerald-500/20 bg-card p-4">
            <div className="mb-2 text-emerald-400/40"><Receipt className="h-4 w-4" /></div>
            <p className="text-2xl font-bold tabular-nums leading-none text-emerald-400">{eur(totalPendingAmt)}</p>
            <p className="mt-1.5 text-xs text-muted-foreground">Offener Betrag</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="mb-2 text-muted-foreground/40"><CheckCircle2 className="h-4 w-4" /></div>
            <p className="text-2xl font-bold tabular-nums leading-none">{summary.finalized?.count ?? 0}</p>
            <p className="mt-1.5 text-xs text-muted-foreground">Finalisiert</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="mb-2 text-muted-foreground/40"><FileOutput className="h-4 w-4" /></div>
            <p className="text-2xl font-bold tabular-nums leading-none">{summary.exported?.count ?? 0}</p>
            <p className="mt-1.5 text-xs text-muted-foreground">Exportiert</p>
          </div>
        </div>

        {/* Status filter tabs */}
        <div className="flex gap-1 border-b border-border overflow-x-auto">
          {[
            { key: "all",       label: "Alle"          },
            { key: "draft",     label: "Entwurf"       },
            { key: "reviewed",  label: "Geprüft"       },
            { key: "finalized", label: "Abgeschlossen" },
            { key: "exported",  label: "Exportiert"    },
            { key: "cancelled", label: "Storniert"     },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setStatusFilter(key)}
              className={`shrink-0 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                statusFilter === key
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground/60 hover:text-muted-foreground"
              }`}
            >
              {label}
              {key !== "all" && summary[key as keyof BatchSummary]?.count
                ? <span className="ml-1 text-xs text-muted-foreground/50">({summary[key as keyof BatchSummary]!.count})</span>
                : null
              }
            </button>
          ))}
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-20 text-muted-foreground/40 gap-2">
            <RefreshCw className="h-4 w-4 animate-spin" />
            <span className="text-sm">Lade Batches…</span>
          </div>
        )}

        {/* Table */}
        {!loading && (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            {visible.length === 0 ? (
              <div className="flex flex-col items-center py-16 gap-3">
                <Wallet className="h-8 w-8 text-muted-foreground/15" />
                <p className="text-sm text-muted-foreground">Keine Batches in dieser Ansicht.</p>
                <Link
                  href="/ops/billing/prepare"
                  className="mt-1 flex items-center gap-1.5 rounded-md bg-primary/10 border border-primary/20 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/15 transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Ersten Batch erstellen
                </Link>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Cutter</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Zeitraum</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide">Clips</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide">Abr. Views</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide">Betrag</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Erstellt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {visible.map(b => (
                    <tr
                      key={b.id}
                      onClick={() => router.push(`/ops/billing/batches/${b.id}`)}
                      className="hover:bg-accent/20 transition-colors cursor-pointer"
                    >
                      <td className="px-5 py-3.5 font-medium">{b.cutter_name ?? "—"}</td>
                      <td className="px-4 py-3.5 text-xs text-muted-foreground">
                        {b.period_start ? `${fmtDate(b.period_start)} – ${fmtDate(b.period_end)}` : "Kein Zeitraum"}
                      </td>
                      <td className="px-4 py-3.5 text-right tabular-nums text-muted-foreground">{b.total_clips}</td>
                      <td className="px-4 py-3.5 text-right tabular-nums">{fmt(b.total_billable_views)}</td>
                      <td className="px-4 py-3.5 text-right tabular-nums font-semibold text-emerald-400">{eur(b.total_amount)}</td>
                      <td className="px-4 py-3.5"><StatusBadge status={b.status} /></td>
                      <td className="px-4 py-3.5 text-xs text-muted-foreground">{fmtDate(b.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

      </main>
    </>
  );
}
