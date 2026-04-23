"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { CutterNav } from "@/components/cutter-nav";
import {
  RefreshCw, ChevronRight, CheckCircle2, Clock, AlertTriangle,
  XCircle, Upload, FileText, Eye, Filter,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────
interface ReportRow {
  id: string | null;
  cutter_id: string | null;
  cutter_name: string | null;
  platform: string | null;
  month: string | null;
  status: string;
  total_views: number | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  created_at: string | null;
  admin_review_note: string | null;
  proof_count: number;
}
interface Summary {
  total: number; submitted: number; under_review: number; approved: number;
  rejected: number; draft: number; reupload_requested: number;
}
interface Cutter { id: string | null; name: string | null; }

// ── Status config ─────────────────────────────────────────────────────────
const STATUS_CFG: Record<string, { label: string; badge: string; icon: React.ElementType }> = {
  draft:              { label: "Entwurf",      badge: "bg-muted/40 text-muted-foreground border-border",              icon: FileText    },
  submitted:          { label: "Eingereicht",  badge: "bg-blue-500/10 text-blue-400 border-blue-500/20",             icon: Clock       },
  under_review:       { label: "In Prüfung",   badge: "bg-purple-500/10 text-purple-400 border-purple-500/20",       icon: Eye         },
  approved:           { label: "Genehmigt",    badge: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",    icon: CheckCircle2},
  rejected:           { label: "Abgelehnt",    badge: "bg-red-500/15 text-red-400 border-red-500/25",                icon: XCircle     },
  reupload_requested: { label: "Neu hochladen",badge: "bg-orange-500/10 text-orange-400 border-orange-500/20",       icon: Upload      },
};

const PLATFORMS: Record<string, string> = {
  youtube: "YouTube", tiktok: "TikTok", instagram: "Instagram", facebook: "Facebook",
};

const fmtNum = new Intl.NumberFormat("de-DE");
function fmtN(n: number | null) {
  if (n === null || n === undefined) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(".", ",")}M`;
  return fmtNum.format(n);
}
function fmtDate(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("de-DE", { day: "2-digit", month: "short", year: "numeric" });
}

// ── Page ──────────────────────────────────────────────────────────────────
export default function OpsInsightsPage() {
  const [items,   setItems]   = useState<ReportRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [cutters, setCutters] = useState<Cutter[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [fMonth,    setFMonth]    = useState("");
  const [fPlatform, setFPlatform] = useState("");
  const [fCutter,   setFCutter]   = useState("");
  const [fStatus,   setFStatus]   = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const sp = new URLSearchParams();
    if (fMonth)    sp.set("month",    fMonth);
    if (fPlatform) sp.set("platform", fPlatform);
    if (fCutter)   sp.set("cutter",   fCutter);
    if (fStatus)   sp.set("status",   fStatus);
    const res = await fetch(`/api/ops/insights?${sp}`);
    if (res.ok) {
      const json = await res.json();
      setItems(json.items ?? []);
      setSummary(json.summary ?? null);
      setCutters(json.cutters ?? []);
    }
    setLoading(false);
  }, [fMonth, fPlatform, fCutter, fStatus]);

  useEffect(() => { load(); }, [load]);

  const needsAction = (summary?.submitted ?? 0) + (summary?.reupload_requested ?? 0);

  return (
    <div className="min-h-screen bg-background">
      <CutterNav />
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-6 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Monats-Insights Review</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Monatliche Plattform-Berichte der Cutter prüfen.</p>
          </div>
          <button
            onClick={load}
            className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {/* KPI cards */}
        {summary && (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            {[
              { label: "Gesamt",       value: summary.total,              cls: "" },
              { label: "Eingereicht",  value: summary.submitted,          cls: "text-blue-400" },
              { label: "In Prüfung",   value: summary.under_review,       cls: "text-purple-400" },
              { label: "Genehmigt",    value: summary.approved,           cls: "text-emerald-400" },
              { label: "Abgelehnt",    value: summary.rejected,           cls: "text-red-400" },
              { label: "Entwurf",      value: summary.draft,              cls: "text-muted-foreground" },
              { label: "Neu hochladen",value: summary.reupload_requested, cls: "text-orange-400" },
            ].map(({ label, value, cls }) => (
              <div key={label} className="rounded-lg border border-border bg-card px-3 py-3 text-center">
                <p className={`text-xl font-bold tabular-nums ${cls}`}>{value}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Attention chip */}
        {needsAction > 0 && (
          <div className="inline-flex items-center gap-1.5 rounded-full border border-orange-500/30 bg-orange-500/10 px-3 py-1 text-xs text-orange-400">
            <AlertTriangle className="h-3 w-3" />
            {needsAction} {needsAction === 1 ? "Bericht" : "Berichte"} brauchen Aufmerksamkeit
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap gap-2 items-center">
          <Filter className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
          <input
            type="month"
            value={fMonth}
            onChange={e => setFMonth(e.target.value)}
            className="rounded-md border border-border bg-background px-2.5 py-1.5 text-xs focus:outline-none"
          />
          <select
            value={fPlatform}
            onChange={e => setFPlatform(e.target.value)}
            className="rounded-md border border-border bg-background px-2.5 py-1.5 text-xs focus:outline-none"
          >
            <option value="">Alle Plattformen</option>
            {Object.entries(PLATFORMS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <select
            value={fStatus}
            onChange={e => setFStatus(e.target.value)}
            className="rounded-md border border-border bg-background px-2.5 py-1.5 text-xs focus:outline-none"
          >
            <option value="">Alle Status</option>
            {Object.entries(STATUS_CFG).map(([v, { label }]) => <option key={v} value={v}>{label}</option>)}
          </select>
          <select
            value={fCutter}
            onChange={e => setFCutter(e.target.value)}
            className="rounded-md border border-border bg-background px-2.5 py-1.5 text-xs focus:outline-none"
          >
            <option value="">Alle Cutter</option>
            {cutters.map(c => <option key={c.id} value={c.id ?? ""}>{c.name}</option>)}
          </select>
          {(fMonth || fPlatform || fStatus || fCutter) && (
            <button
              onClick={() => { setFMonth(""); setFPlatform(""); setFStatus(""); setFCutter(""); }}
              className="text-xs text-muted-foreground hover:text-foreground underline"
            >
              Zurücksetzen
            </button>
          )}
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-12 text-sm text-muted-foreground">
            Keine Berichte gefunden.
          </div>
        ) : (
          <div className="rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/20">
                  {["Cutter", "Plattform", "Monat", "Views", "Screenshots", "Status", "Eingereicht", ""].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map(item => {
                  const cfg  = STATUS_CFG[item.status] ?? STATUS_CFG.draft;
                  const Icon = cfg.icon;
                  const urgent = ["submitted", "reupload_requested"].includes(item.status);
                  return (
                    <tr
                      key={item.id}
                      className={`border-b border-border/50 hover:bg-accent/20 transition-colors ${urgent ? "bg-blue-500/[0.02]" : ""}`}
                    >
                      <td className="px-4 py-3 font-medium">{item.cutter_name ?? "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{PLATFORMS[item.platform ?? ""] ?? item.platform ?? "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground tabular-nums">{item.month ?? "—"}</td>
                      <td className="px-4 py-3 tabular-nums">{fmtN(item.total_views)}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        {item.proof_count > 0
                          ? `${item.proof_count} Datei${item.proof_count !== 1 ? "en" : ""}`
                          : <span className="text-red-400/60">Keine</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${cfg.badge}`}>
                          <Icon className="h-2.5 w-2.5" />
                          {cfg.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{fmtDate(item.submitted_at)}</td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/ops/insights/${item.id}`}
                          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                        >
                          Prüfen <ChevronRight className="h-3 w-3" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

      </div>
    </div>
  );
}
