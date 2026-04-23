"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CutterNav } from "@/components/cutter-nav";
import {
  RefreshCw, ChevronLeft, ChevronRight, ChevronRight as ArrowRight,
  ShieldAlert, CheckCircle2, AlertTriangle, Clock, Plus, X,
} from "lucide-react";
import {
  RISK_CFG, AUDIT_STATUS_CFG, DATA_SOURCE_CFG,
  PLATFORM_LABELS, riskLevel,
  type AuditStatus, type DataSource,
} from "@/lib/audit-risk";

// ── Types ─────────────────────────────────────────────────────────────────
interface AuditRow {
  id:               string;
  cutter_id:        string | null;
  cutter_name:      string | null;
  platform:         string | null;
  month:            string | null;
  total_views:      number;
  total_clips:      number;
  data_source:      string;
  audit_status:     string;
  fraud_risk_score: number;
  risk_flags:       string[];
  submitted_at:     string | null;
  reviewed_at:      string | null;
}
interface Summary { total: number; pending: number; flagged: number; approved: number; high_risk: number; critical: number; }
interface Cutter  { id: string | null; name: string | null; }
interface AuditData { items: AuditRow[]; summary: Summary; cutters: Cutter[]; month: string; }

// ── Month helpers ─────────────────────────────────────────────────────────
function currentMonth() { return new Date().toISOString().slice(0, 7); }
function fmtMonth(ym: string) {
  const [y, m] = ym.split('-');
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
}
function shiftMonth(ym: string, delta: number) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// ── Create modal ──────────────────────────────────────────────────────────
function CreateModal({
  cutters, month, onClose, onCreated,
}: {
  cutters: Cutter[]; month: string;
  onClose: () => void; onCreated: () => void;
}) {
  const [cutterId, setCutterId] = useState("");
  const [platform, setPlatform] = useState("youtube");
  const [selMonth, setSelMonth] = useState(month);
  const [busy,     setBusy]     = useState(false);
  const [err,      setErr]      = useState("");

  async function submit() {
    if (!cutterId) { setErr("Bitte einen Cutter auswählen."); return; }
    setBusy(true); setErr("");
    const res = await fetch("/api/ops/audits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cutter_id: cutterId, platform, month: selMonth }),
    });
    const json = await res.json();
    if (res.ok) { onCreated(); onClose(); }
    else { setErr(json.error ?? "Fehler"); setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-semibold text-sm">Neuen Monats-Audit erstellen</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground font-medium">Cutter</label>
            <select value={cutterId} onChange={e => setCutterId(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring">
              <option value="">— Cutter wählen —</option>
              {cutters.map(c => <option key={c.id!} value={c.id!}>{c.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground font-medium">Plattform</label>
              <select value={platform} onChange={e => setPlatform(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring">
                {Object.entries(PLATFORM_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground font-medium">Monat</label>
              <input type="month" value={selMonth} onChange={e => setSelMonth(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
            </div>
          </div>
          {err && <p className="text-xs text-red-400">{err}</p>}
          <button onClick={submit} disabled={busy}
            className="w-full rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
            {busy ? <RefreshCw className="h-4 w-4 animate-spin mx-auto" /> : "Audit erstellen"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────
export default function AuditsPage() {
  const router = useRouter();
  const [data,        setData]        = useState<AuditData | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [month,       setMonth]       = useState(currentMonth());
  const [filterPlat,  setFilterPlat]  = useState("all");
  const [filterCut,   setFilterCut]   = useState("all");
  const [filterStatus,setFilterStatus]= useState("all");
  const [filterRisk,  setFilterRisk]  = useState("all");
  const [showCreate,  setShowCreate]  = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const sp = new URLSearchParams({ month });
    if (filterPlat   !== "all") sp.set("platform", filterPlat);
    if (filterCut    !== "all") sp.set("cutter",   filterCut);
    if (filterStatus !== "all") sp.set("status",   filterStatus);
    if (filterRisk   !== "all") sp.set("risk",     filterRisk);
    const res = await fetch(`/api/ops/audits?${sp}`);
    if (res.status === 401) { router.push("/login"); return; }
    if (res.status === 403) { router.push("/dashboard"); return; }
    setData(await res.json());
    setLoading(false);
  }, [router, month, filterPlat, filterCut, filterStatus, filterRisk]);

  useEffect(() => { load(); }, [load]);

  const visible = useMemo(() => data?.items ?? [], [data]);
  const { summary, cutters } = data ?? { summary: null, cutters: [] };

  const fmt = (n: number) => new Intl.NumberFormat("de-DE").format(n);

  return (
    <>
      <CutterNav />
      {showCreate && data && (
        <CreateModal
          cutters={cutters}
          month={month}
          onClose={() => setShowCreate(false)}
          onCreated={load}
        />
      )}

      <main className="mx-auto max-w-7xl px-6 py-8 space-y-5">

        {/* ── Header ──────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Monats-Audits</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Monatliche Plattform-Insights, Geo-Analyse &amp; Fraud-Risiko
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={load} disabled={loading}
              className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-40 transition-colors">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              Aktualisieren
            </button>
            <button onClick={() => setShowCreate(true)}
              className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 transition-opacity">
              <Plus className="h-3.5 w-3.5" />
              Neuer Audit
            </button>
          </div>
        </div>

        {/* ── Month picker ─────────────────────────────────────── */}
        <div className="flex items-center gap-2">
          <button onClick={() => setMonth(m => shiftMonth(m, -1))}
            className="rounded-md border border-border bg-card p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-medium min-w-[140px] text-center">{fmtMonth(month)}</span>
          <button onClick={() => setMonth(m => shiftMonth(m, 1))}
            disabled={month >= currentMonth()}
            className="rounded-md border border-border bg-card p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-30 transition-colors">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* ── KPI cards ────────────────────────────────────────── */}
        {summary && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[
              { label: "Gesamt",      value: summary.total,     icon: <Clock className="h-4 w-4" />,        accent: "" },
              { label: "Ausstehend",  value: summary.pending,   icon: <Clock className="h-4 w-4" />,        accent: "text-muted-foreground" },
              { label: "Genehmigt",   value: summary.approved,  icon: <CheckCircle2 className="h-4 w-4" />, accent: "text-emerald-400" },
              { label: "Verdächtig",  value: summary.flagged,   icon: <ShieldAlert className="h-4 w-4" />,  accent: "text-red-400" },
              { label: "Hohes Risiko",value: summary.high_risk, icon: <AlertTriangle className="h-4 w-4" />,accent: "text-orange-400" },
              { label: "Kritisch",    value: summary.critical,  icon: <ShieldAlert className="h-4 w-4" />,  accent: "text-red-400" },
            ].map(k => (
              <div key={k.label} className="rounded-lg border border-border bg-card p-3.5">
                <div className={`mb-1.5 ${k.accent || "text-muted-foreground/40"}`}>{k.icon}</div>
                <p className={`text-2xl font-bold tabular-nums leading-none ${k.accent}`}>{k.value}</p>
                <p className="mt-1 text-xs text-muted-foreground">{k.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* ── Filters ──────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-2">
          {[
            { label: "Plattform", value: filterPlat, set: setFilterPlat,
              opts: [["all","Alle Plattformen"], ...Object.entries(PLATFORM_LABELS)] },
            { label: "Status", value: filterStatus, set: setFilterStatus,
              opts: [["all","Alle Status"], ...Object.keys(AUDIT_STATUS_CFG).map(k => [k, (AUDIT_STATUS_CFG as Record<string, {label: string}>)[k].label])] },
            { label: "Risiko", value: filterRisk, set: setFilterRisk,
              opts: [["all","Alle Risiken"],["low","Niedrig"],["medium","Mittel"],["high","Hoch"],["critical","Kritisch"]] },
          ].map(f => (
            <select key={f.label} value={f.value} onChange={e => f.set(e.target.value)}
              className="rounded-md border border-border bg-card px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring">
              {f.opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          ))}
          {(data?.cutters?.length ?? 0) > 1 && (
            <select value={filterCut} onChange={e => setFilterCut(e.target.value)}
              className="rounded-md border border-border bg-card px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring">
              <option value="all">Alle Cutter</option>
              {(cutters ?? []).map(c => <option key={c.id!} value={c.id!}>{c.name}</option>)}
            </select>
          )}
        </div>

        {/* ── Loading / empty ───────────────────────────────────── */}
        {loading && (
          <div className="flex items-center justify-center py-20 text-muted-foreground/40 gap-2">
            <RefreshCw className="h-4 w-4 animate-spin" />
            <span className="text-sm">Lade Audits…</span>
          </div>
        )}
        {!loading && visible.length === 0 && (
          <div className="rounded-xl border border-border bg-card flex flex-col items-center py-20 text-center gap-3">
            <CheckCircle2 className="h-10 w-10 text-muted-foreground/15" />
            <p className="text-sm font-medium">Keine Audits für diesen Monat</p>
            <p className="text-xs text-muted-foreground">Erstelle einen neuen Audit mit dem Button oben rechts.</p>
          </div>
        )}

        {/* ── Table ────────────────────────────────────────────── */}
        {!loading && visible.length > 0 && (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-4 py-2.5 border-b border-border/60 bg-muted/10">
              <span className="text-xs text-muted-foreground tabular-nums">
                {visible.length} Audit{visible.length !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/5">
                    {["Cutter", "Plattform", "Views", "Clips", "Datenquelle", "Status", "Risiko", ""].map(h => (
                      <th key={h} className="px-4 py-2.5 text-left font-medium text-muted-foreground uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {visible.map(item => {
                    const level   = riskLevel(item.fraud_risk_score);
                    const rCfg    = RISK_CFG[level];
                    const sCfg    = AUDIT_STATUS_CFG[item.audit_status as AuditStatus] ?? AUDIT_STATUS_CFG.pending;
                    const dsCfg   = DATA_SOURCE_CFG[item.data_source as DataSource] ?? DATA_SOURCE_CFG.unavailable;
                    return (
                      <tr key={item.id} className={`transition-colors hover:bg-accent/15 ${rCfg.rowCls}`}>
                        <td className="px-4 py-3">
                          <p className="font-medium">{item.cutter_name ?? "—"}</p>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="rounded bg-muted/40 px-1.5 py-0.5 text-xs font-medium">
                            {PLATFORM_LABELS[item.platform ?? ""] ?? item.platform}
                          </span>
                        </td>
                        <td className="px-4 py-3 tabular-nums text-right">{fmt(item.total_views)}</td>
                        <td className="px-4 py-3 tabular-nums text-right text-muted-foreground">{item.total_clips}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-medium ${dsCfg.badge}`}>
                            {dsCfg.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-medium ${sCfg.badge}`}>
                            {sCfg.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <span className={`h-1.5 w-1.5 rounded-full ${rCfg.dot}`} />
                            <span className={`font-semibold tabular-nums ${rCfg.text}`}>{item.fraud_risk_score}</span>
                            <span className={`rounded border px-1 py-0.5 text-[10px] font-medium ${rCfg.badge}`}>{rCfg.label}</span>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <Link href={`/ops/audits/${item.id}`}
                            className="flex items-center justify-center rounded-md border border-border bg-muted/10 p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
                            <ArrowRight className="h-3.5 w-3.5" />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </main>
    </>
  );
}
