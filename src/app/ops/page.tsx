"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CutterNav } from "@/components/cutter-nav";
import {
  ShieldAlert, Users, Video, CheckCircle2, AlertTriangle,
  XCircle, ChevronRight, RefreshCw, ClipboardList,
} from "lucide-react";
import { describeAuditEntry, auditDotClass } from "@/lib/audit-describe";

interface AlertRow {
  id: string; cutter_id: string; video_id: string | null;
  alert_type: string; severity: "critical" | "high" | "medium" | "low";
  title: string; description: string; status: "open" | "resolved" | "dismissed";
  created_at: string; cutter_name: string; video_url: string | null; video_platform: string | null;
}
interface CutterRow {
  id: string; name: string; email: string; role: string;
  is_active: number; video_count: number; flagged_count: number; verified_count: number; score?: number;
}
interface AuditRow {
  id: string; actor_name: string; action: string; entity_type: string;
  entity_id: string | null; meta: string | null; created_at: string;
  video_title: string | null; video_platform: string | null;
}
interface VideoStats { total: number; verified: number; suspicious: number; critical: number; matched: number; }
interface OpsData { alerts: AlertRow[]; cutters: CutterRow[]; stats: VideoStats; auditLog: AuditRow[]; }

const SEVERITY_STYLES: Record<string, { dot: string; text: string; badge: string }> = {
  critical: { dot: "bg-red-400",    text: "text-red-400",    badge: "border-red-500/25 bg-red-500/8 text-red-400" },
  high:     { dot: "bg-orange-400", text: "text-orange-400", badge: "border-orange-500/25 bg-orange-500/8 text-orange-400" },
  medium:   { dot: "bg-yellow-400", text: "text-yellow-400", badge: "border-yellow-500/25 bg-yellow-500/8 text-yellow-400" },
  low:      { dot: "bg-blue-400",   text: "text-blue-400",   badge: "border-blue-500/25 bg-blue-500/8 text-blue-400" },
};

const SEVERITY_LABELS: Record<string, string> = {
  critical: "Kritisch", high: "Hoch", medium: "Mittel", low: "Niedrig",
};

const PLATFORM_LABELS: Record<string, string> = {
  youtube: "YouTube", tiktok: "TikTok", instagram: "Instagram", facebook: "Facebook",
};


function formatNum(n: number | null | undefined): string {
  if (n == null) return "0";
  return new Intl.NumberFormat("de-DE").format(n);
}

// ── Tab ────────────────────────────────────────────────────────────
function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
        active
          ? "border-primary text-foreground"
          : "border-transparent text-muted-foreground/60 hover:text-muted-foreground hover:border-border/60"
      }`}
    >
      {children}
    </button>
  );
}

// ── KPI Card ───────────────────────────────────────────────────────
function KpiCard({ icon, label, value, accent }: {
  icon: React.ReactNode; label: string; value: string; accent?: "emerald" | "yellow" | "red";
}) {
  const borderColor =
    accent === "emerald" ? "border-emerald-500/20" :
    accent === "yellow"  ? "border-yellow-500/20" :
    accent === "red"     ? "border-red-500/20"    : "border-border";
  const textColor =
    accent === "emerald" ? "text-emerald-400" :
    accent === "yellow"  ? "text-yellow-400" :
    accent === "red"     ? "text-red-400"    : "";
  return (
    <div className={`rounded-lg border ${borderColor} bg-card p-4`}>
      <div className="mb-2.5 text-muted-foreground/40">{icon}</div>
      <p className={`text-2xl font-bold tabular-nums leading-none ${textColor}`}>{value}</p>
      <p className="mt-1.5 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

type Tab = "alerts" | "cutters" | "audit";

export default function OpsPage() {
  const router = useRouter();
  const [data,      setData]      = useState<OpsData | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [resolving, setResolving] = useState<string | null>(null);
  const [tab,       setTab]       = useState<Tab>("alerts");

  async function load() {
    setLoading(true);
    const res = await fetch("/api/ops");
    if (res.status === 401) { router.push("/login"); return; }
    if (res.status === 403) { router.push("/dashboard"); return; }
    setData(await res.json());
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function resolveAlert(alertId: string, status: "resolved" | "dismissed") {
    setResolving(alertId);
    await fetch("/api/ops", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ alertId, status }),
    });
    await load();
    setResolving(null);
  }

  if (loading) {
    return (
      <>
        <CutterNav />
        <main className="mx-auto max-w-6xl px-6 py-8 flex items-center justify-center py-24 text-muted-foreground/40">
          <RefreshCw className="h-4 w-4 animate-spin mr-2.5" />
          <span className="text-sm">Lade Ops-Daten…</span>
        </main>
      </>
    );
  }

  const { alerts, cutters, stats, auditLog } = data!;
  const openAlerts = alerts.filter((a) => a.status === "open");

  return (
    <>
      <CutterNav />
      <main className="mx-auto max-w-6xl px-6 py-8 space-y-6">

        {/* ── Page header ──────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Ops Dashboard</h1>
            <p className="mt-1 text-sm text-muted-foreground">Verifikation, Alerts &amp; Audit Log</p>
          </div>
          <button
            onClick={load}
            className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Aktualisieren
          </button>
        </div>

        {/* ── KPI row ──────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard icon={<Video className="h-4 w-4" />}              label="Videos gesamt" value={formatNum(stats.total)} />
          <KpiCard icon={<CheckCircle2 className="h-4 w-4" />}       label="Verifiziert"   value={formatNum(stats.verified)}   accent="emerald" />
          <KpiCard icon={<AlertTriangle className="h-4 w-4" />}      label="Verdächtig"    value={formatNum(stats.suspicious)} accent="yellow" />
          <KpiCard icon={<XCircle className="h-4 w-4" />}            label="Kritisch"      value={formatNum(stats.critical)}   accent="red" />
        </div>

        {/* ── Tabs ─────────────────────────────────────────────── */}
        <div>
          <div className="flex gap-0 border-b border-border">
            <Tab active={tab === "alerts"} onClick={() => setTab("alerts")}>
              <ShieldAlert className="h-3.5 w-3.5" />
              Alerts
              {openAlerts.length > 0 && (
                <span className="rounded-full bg-red-500/15 border border-red-500/25 px-1.5 py-0.5 text-xs text-red-400 font-medium tabular-nums">
                  {openAlerts.length}
                </span>
              )}
            </Tab>
            <Tab active={tab === "cutters"} onClick={() => setTab("cutters")}>
              <Users className="h-3.5 w-3.5" />
              Cutter
              <span className="rounded-full bg-muted/40 px-1.5 py-0.5 text-xs text-muted-foreground/60 tabular-nums">{cutters.length}</span>
            </Tab>
            <Tab active={tab === "audit"} onClick={() => setTab("audit")}>
              <ClipboardList className="h-3.5 w-3.5" />
              Audit Log
            </Tab>
          </div>

          {/* ── Alerts tab ──────────────────────────────────────── */}
          {tab === "alerts" && (
            <div className="mt-4">
              {openAlerts.length === 0 ? (
                <div className="rounded-lg border border-border bg-card flex flex-col items-center py-16 text-center gap-2">
                  <CheckCircle2 className="h-8 w-8 text-emerald-400/30 mb-1" />
                  <p className="text-sm font-medium">Keine offenen Alerts</p>
                  <p className="text-xs text-muted-foreground">Alles in Ordnung.</p>
                </div>
              ) : (
                <div className="rounded-lg border border-border bg-card divide-y divide-border overflow-hidden">
                  {openAlerts.map((alert) => {
                    const sty = SEVERITY_STYLES[alert.severity] ?? SEVERITY_STYLES.low;
                    return (
                      <div key={alert.id} className="flex items-start gap-4 px-5 py-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium ${sty.badge}`}>
                              <span className={`h-1.5 w-1.5 rounded-full ${sty.dot}`} />
                              {SEVERITY_LABELS[alert.severity] ?? alert.severity}
                            </span>
                            <span className="text-sm font-medium">{alert.title}</span>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{alert.description}</p>
                          <div className="mt-1.5 flex items-center gap-3 text-xs text-muted-foreground">
                            <span className="font-medium text-foreground/60">{alert.cutter_name}</span>
                            {alert.video_platform && <span>{PLATFORM_LABELS[alert.video_platform] ?? alert.video_platform}</span>}
                            {alert.video_url && (
                              <a href={alert.video_url} target="_blank" rel="noopener noreferrer"
                                className="flex items-center gap-0.5 hover:text-foreground transition-colors">
                                Video <ChevronRight className="h-3 w-3" />
                              </a>
                            )}
                            <span>{new Date(alert.created_at).toLocaleDateString("de-DE")}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 pt-0.5">
                          <button
                            onClick={() => resolveAlert(alert.id, "resolved")}
                            disabled={resolving === alert.id}
                            className="rounded-md border border-emerald-500/25 bg-emerald-500/8 px-2.5 py-1 text-xs text-emerald-400 hover:bg-emerald-500/15 disabled:opacity-40 transition-colors"
                          >
                            Lösen
                          </button>
                          <button
                            onClick={() => resolveAlert(alert.id, "dismissed")}
                            disabled={resolving === alert.id}
                            className="rounded-md border border-border bg-card px-2.5 py-1 text-xs text-muted-foreground hover:bg-accent disabled:opacity-40 transition-colors"
                          >
                            Verwerfen
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── Cutters tab ─────────────────────────────────────── */}
          {tab === "cutters" && (
            <div className="mt-4">
              <div className="rounded-lg border border-border bg-card overflow-hidden">
                {cutters.length === 0 ? (
                  <div className="flex flex-col items-center py-14 text-center gap-2">
                    <Users className="h-7 w-7 text-muted-foreground/15 mb-1" />
                    <p className="text-sm text-muted-foreground">Keine Cutter gefunden.</p>
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Name</th>
                        <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Rolle</th>
                        <th className="px-5 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide">Videos</th>
                        <th className="px-5 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide">Verifiziert</th>
                        <th className="px-5 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide">Flagged</th>
                        <th className="px-5 py-3 text-center text-xs font-medium text-muted-foreground uppercase tracking-wide">Score</th>
                        <th className="px-5 py-3 text-center text-xs font-medium text-muted-foreground uppercase tracking-wide">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {cutters.map((c) => (
                        <tr key={c.id} className="hover:bg-accent/20 transition-colors">
                          <td className="px-5 py-3.5">
                            <p className="font-medium text-sm">{c.name}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{c.email}</p>
                          </td>
                          <td className="px-5 py-3.5">
                            <span className="rounded-md border border-border bg-muted/20 px-1.5 py-0.5 text-xs text-muted-foreground">{c.role}</span>
                          </td>
                          <td className="px-5 py-3.5 text-right tabular-nums text-muted-foreground">{formatNum(c.video_count)}</td>
                          <td className="px-5 py-3.5 text-right tabular-nums text-emerald-400 font-medium">{formatNum(c.verified_count)}</td>
                          <td className="px-5 py-3.5 text-right tabular-nums">
                            {c.flagged_count > 0
                              ? <span className="font-semibold text-red-400">{formatNum(c.flagged_count)}</span>
                              : <span className="text-muted-foreground/30">—</span>}
                          </td>
                          <td className="px-5 py-3.5 text-center">
                            {c.score !== undefined ? (
                              <span className={`font-semibold tabular-nums ${
                                c.score >= 80 ? "text-emerald-400" : c.score >= 50 ? "text-yellow-400" : "text-red-400"
                              }`}>{c.score}</span>
                            ) : <span className="text-muted-foreground/30">—</span>}
                          </td>
                          <td className="px-5 py-3.5 text-center">
                            {c.is_active ? (
                              <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/20 bg-emerald-500/8 px-2 py-0.5 text-xs font-medium text-emerald-400">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />Aktiv
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/20 px-2 py-0.5 text-xs text-muted-foreground/50">
                                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/20" />Inaktiv
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {/* ── Audit Log tab ────────────────────────────────────── */}
          {tab === "audit" && (
            <div className="mt-4">
              {auditLog.length === 0 ? (
                <div className="rounded-lg border border-border bg-card flex flex-col items-center py-14 text-center gap-2">
                  <ClipboardList className="h-7 w-7 text-muted-foreground/15 mb-1" />
                  <p className="text-sm text-muted-foreground">Noch keine Audit-Einträge vorhanden.</p>
                </div>
              ) : (
                <div className="rounded-lg border border-border bg-card divide-y divide-border/60 overflow-hidden">
                  {auditLog.map((entry) => {
                    const description = describeAuditEntry(entry.action, entry.meta, entry.actor_name);
                    const dotCls      = auditDotClass(entry.action);
                    const isVideoAction = entry.entity_type === "video" && entry.entity_id;

                    return (
                      <div key={entry.id} className="flex items-start gap-3.5 px-5 py-3.5">
                        {/* Dot */}
                        <div className="mt-2 shrink-0">
                          <span className={`block h-2 w-2 rounded-full ${dotCls}`} />
                        </div>
                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm leading-snug">{description}</p>
                          {/* Video link if this event is about a clip */}
                          {isVideoAction && (
                            <div className="mt-1 flex items-center gap-1.5">
                              {entry.video_platform && (
                                <span className="text-xs text-muted-foreground/50">
                                  {PLATFORM_LABELS[entry.video_platform] ?? entry.video_platform}
                                </span>
                              )}
                              <Link
                                href={`/ops/clips/${entry.entity_id}`}
                                className="text-xs text-muted-foreground/50 hover:text-foreground/70 transition-colors flex items-center gap-0.5"
                              >
                                {entry.video_title
                                  ? <span className="truncate max-w-[220px]">{entry.video_title}</span>
                                  : <span className="font-mono">{entry.entity_id!.slice(0, 8)}…</span>
                                }
                                <ChevronRight className="h-3 w-3 shrink-0" />
                              </Link>
                            </div>
                          )}
                        </div>
                        {/* Timestamp */}
                        <span className="shrink-0 text-xs text-muted-foreground/50 tabular-nums whitespace-nowrap pt-0.5">
                          {new Date(entry.created_at).toLocaleString("de-DE", {
                            day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
                          })}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

      </main>
    </>
  );
}
