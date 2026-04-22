"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CutterNav } from "@/components/cutter-nav";
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Eye,
  Filter,
  RefreshCw,
  Search,
  Shield,
  Sparkles,
  UserCheck,
  X,
  Zap,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────

type Severity = "critical" | "high" | "medium" | "low";
type AlertStatus = "open" | "acknowledged" | "in_review" | "resolved" | "dismissed";
type AlertType =
  | "discrepancy_critical"
  | "discrepancy_suspicious"
  | "proof_submitted"
  | "proof_overdue"
  | "sync_stale"
  | "no_verification";

interface AlertVideo {
  title: string | null;
  platform: string | null;
  url: string | null;
  claimedViews: number | null;
  currentViews: number | null;
  discrepancyPercent: number | null;
  proofStatus: string | null;
  lastScrapedAt: string | null;
}

interface AlertItem {
  id: string;
  type: AlertType;
  severity: Severity;
  status: AlertStatus;
  title: string;
  detail: string | null;
  meta: Record<string, unknown>;
  videoId: string;
  cutterId: string;
  cutterName: string;
  assigneeId: string | null;
  assigneeName: string | null;
  triggeredAt: string;
  updatedAt: string;
  video: AlertVideo;
}

interface QueueResponse {
  alerts: AlertItem[];
  statusCounts: Record<string, number>;
  openBySeverity: Record<string, number>;
  totalActive: number;
  totalMatching: number;
  hasMore: boolean;
}

// ── Static config ──────────────────────────────────────────────

const SEVERITY_CONFIG: Record<Severity, {
  label: string; colorClass: string; dotClass: string;
  stripClass: string; badgeClass: string;
}> = {
  critical: {
    label: "Kritisch",
    colorClass: "text-red-400",
    dotClass: "bg-red-500",
    stripClass: "bg-red-500",
    badgeClass: "bg-red-500/10 text-red-400 border-red-500/20",
  },
  high: {
    label: "Hoch",
    colorClass: "text-orange-400",
    dotClass: "bg-orange-500",
    stripClass: "bg-orange-500",
    badgeClass: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  },
  medium: {
    label: "Mittel",
    colorClass: "text-yellow-400",
    dotClass: "bg-yellow-500",
    stripClass: "bg-yellow-500",
    badgeClass: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  },
  low: {
    label: "Niedrig",
    colorClass: "text-blue-400",
    dotClass: "bg-blue-400",
    stripClass: "bg-blue-400",
    badgeClass: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  },
};

const STATUS_CONFIG: Record<AlertStatus, { label: string; badgeClass: string }> = {
  open:         { label: "Offen",      badgeClass: "bg-muted text-muted-foreground" },
  acknowledged: { label: "Bestätigt",  badgeClass: "bg-blue-500/10 text-blue-400" },
  in_review:    { label: "In Prüfung", badgeClass: "bg-primary/15 text-primary" },
  resolved:     { label: "Gelöst",     badgeClass: "bg-emerald-500/10 text-emerald-400" },
  dismissed:    { label: "Ignoriert",  badgeClass: "bg-muted/50 text-muted-foreground/50" },
};

const TYPE_LABELS: Record<AlertType, string> = {
  discrepancy_critical:   "Krit. Diskrepanz",
  discrepancy_suspicious: "Verd. Diskrepanz",
  proof_submitted:        "Beleg ausstehend",
  proof_overdue:          "Beleg überfällig",
  sync_stale:             "Sync veraltet",
  no_verification:        "Keine Verifikation",
};

const PLATFORM_LABELS: Record<string, string> = {
  youtube: "YouTube", tiktok: "TikTok", instagram: "Instagram", facebook: "Facebook",
};

const ALL_SEVERITIES: Severity[]    = ["critical", "high", "medium", "low"];
const ALL_TYPES: AlertType[]        = ["discrepancy_critical", "discrepancy_suspicious", "proof_submitted", "proof_overdue", "sync_stale", "no_verification"];
const ACTIVE_STATUSES: AlertStatus[] = ["open", "acknowledged", "in_review"];
const ALL_STATUSES: AlertStatus[]   = ["open", "acknowledged", "in_review", "resolved", "dismissed"];

// ── Helpers ────────────────────────────────────────────────────

function formatNum(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  return new Intl.NumberFormat("de-DE").format(n);
}

function formatRelative(iso: string | null): string {
  if (!iso) return "nie";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 2)  return "gerade eben";
  if (mins < 60) return `vor ${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `vor ${hours}h`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "gestern" : `vor ${days}d`;
}

// ── Filter Pill ────────────────────────────────────────────────

function FilterPill({
  active, onClick, label, count, dotClass,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count?: number;
  dotClass?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all whitespace-nowrap ${
        active
          ? "border-primary/40 bg-primary/10 text-primary"
          : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
      }`}
    >
      {dotClass && <span className={`h-2 w-2 rounded-full shrink-0 ${dotClass}`} />}
      {label}
      {count != null && count > 0 && (
        <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none ${
          active ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
        }`}>
          {count}
        </span>
      )}
    </button>
  );
}

// ── Alert Card ─────────────────────────────────────────────────

function AlertCard({
  alert, onAction, currentUserName,
}: {
  alert: AlertItem;
  onAction: (id: string, action: string) => Promise<void>;
  currentUserName: string | null;
}) {
  const [acting, setActing]   = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const sev = SEVERITY_CONFIG[alert.severity] ?? SEVERITY_CONFIG.medium;
  const sta = STATUS_CONFIG[alert.status]     ?? STATUS_CONFIG.open;
  const isActive = !["resolved", "dismissed"].includes(alert.status);
  const discPct  = alert.video.discrepancyPercent ?? (alert.meta.discrepancy_percent as number | null);

  async function act(action: string) {
    setActing(action);
    await onAction(alert.id, action);
    setActing(null);
  }

  const Spinner = () => <RefreshCw className="h-3.5 w-3.5 animate-spin" />;

  return (
    <div className={`relative flex rounded-xl border border-border bg-card overflow-hidden transition-opacity ${
      !isActive ? "opacity-55" : ""
    }`}>
      {/* Severity left strip */}
      <div className={`w-1 shrink-0 ${sev.stripClass}`} />

      <div className="flex-1 min-w-0 p-4 space-y-3">
        {/* ── Row 1: severity + type + platform + status + time ── */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <span className={`flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide ${sev.colorClass}`}>
              <span className={`h-2 w-2 rounded-full ${sev.dotClass}`} />
              {sev.label}
            </span>
            <span className={`rounded border px-1.5 py-0.5 text-xs font-medium ${sev.badgeClass}`}>
              {TYPE_LABELS[alert.type] ?? alert.type}
            </span>
            {alert.video.platform && (
              <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                {PLATFORM_LABELS[alert.video.platform] ?? alert.video.platform}
              </span>
            )}
            <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${sta.badgeClass}`}>
              {sta.label}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0 text-xs text-muted-foreground">
            {alert.assigneeName && (
              <span className="flex items-center gap-1">
                <UserCheck className="h-3 w-3" />
                {alert.assigneeName}
              </span>
            )}
            <span className="text-muted-foreground/50">{formatRelative(alert.triggeredAt)}</span>
          </div>
        </div>

        {/* ── Row 2: title + clip info ── */}
        <div>
          <p className="text-sm font-semibold leading-snug mb-1">{alert.title}</p>
          <div className="flex items-center gap-1.5 flex-wrap text-xs text-muted-foreground">
            <span className="font-medium text-foreground/75">
              {alert.video.title
                ? (alert.video.title.length > 60 ? alert.video.title.slice(0, 60) + "…" : alert.video.title)
                : "Unbekannter Clip"}
            </span>
            <span className="text-muted-foreground/40">·</span>
            <span>{alert.cutterName}</span>
            {alert.video.url && (
              <a href={alert.video.url} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center hover:text-primary transition-colors">
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>

        {/* ── Row 3: type-specific context data ── */}
        <div className="flex items-center gap-3 flex-wrap">
          {(alert.type === "discrepancy_critical" || alert.type === "discrepancy_suspicious") && discPct != null && (
            <>
              <span className={`text-sm font-bold font-mono ${
                alert.severity === "critical" ? "text-red-400" : "text-orange-400"
              }`}>
                {discPct > 0 ? "+" : ""}{discPct.toFixed(1)}%
              </span>
              <span className="text-xs text-muted-foreground">
                Angabe {formatNum(alert.video.claimedViews)} · Verifiziert {formatNum(alert.video.currentViews)}
              </span>
            </>
          )}
          {alert.type === "proof_submitted" && (
            <span className="text-xs text-muted-foreground">Beleg hochgeladen — wartet auf Genehmigung</span>
          )}
          {alert.type === "proof_overdue" && (
            <span className={`text-xs font-medium ${(alert.meta.hours_overdue as number) > 0 ? "text-orange-400" : "text-muted-foreground"}`}>
              {(alert.meta.hours_overdue as number) > 0
                ? `${alert.meta.hours_overdue}h ohne Einreichung`
                : "Beleg angefordert — keine Einreichung"}
            </span>
          )}
          {alert.type === "sync_stale" && (
            <span className="text-xs text-yellow-400">
              Letzter Sync: {formatRelative(alert.video.lastScrapedAt)}
            </span>
          )}
          {alert.type === "no_verification" && (
            <span className="text-xs text-muted-foreground">Keine API-Verifikation möglich</span>
          )}
        </div>

        {/* ── Expandable detail ── */}
        {alert.detail && (
          <div>
            <button
              onClick={() => setExpanded(p => !p)}
              className="flex items-center gap-1 text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors"
            >
              {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {expanded ? "Weniger" : "Details"}
            </button>
            {expanded && (
              <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed pl-3 border-l-2 border-border">
                {alert.detail}
              </p>
            )}
          </div>
        )}

        {/* ── Action row ── */}
        <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
          <Link
            href={`/ops/clips/${alert.videoId}`}
            className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <Eye className="h-3.5 w-3.5" />
            Clip öffnen
          </Link>

          {isActive && (
            <>
              {alert.status === "open" && (
                <button onClick={() => act("acknowledge")} disabled={acting !== null}
                  className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50 transition-colors">
                  {acting === "acknowledge" ? <Spinner /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  Bestätigen
                </button>
              )}

              {["open", "acknowledged"].includes(alert.status) && (
                <button onClick={() => act("start_review")} disabled={acting !== null}
                  className="flex items-center gap-1 rounded-lg border border-primary/30 bg-primary/5 px-2.5 py-1.5 text-xs text-primary hover:bg-primary/15 disabled:opacity-50 transition-colors">
                  {acting === "start_review" ? <Spinner /> : <Search className="h-3.5 w-3.5" />}
                  In Prüfung
                </button>
              )}

              {!alert.assigneeName && (
                <button onClick={() => act("assign_self")} disabled={acting !== null}
                  title={currentUserName ? `Mir zuweisen (${currentUserName})` : "Mir zuweisen"}
                  className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50 transition-colors">
                  {acting === "assign_self" ? <Spinner /> : <UserCheck className="h-3.5 w-3.5" />}
                  Mir
                </button>
              )}

              <button onClick={() => act("resolve")} disabled={acting !== null}
                className="flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-2.5 py-1.5 text-xs text-emerald-400 hover:bg-emerald-500/15 disabled:opacity-50 transition-colors">
                {acting === "resolve" ? <Spinner /> : <Shield className="h-3.5 w-3.5" />}
                Lösen
              </button>

              <button onClick={() => act("dismiss")} disabled={acting !== null}
                className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground/60 hover:bg-accent hover:text-muted-foreground disabled:opacity-50 transition-colors">
                {acting === "dismiss" ? <Spinner /> : <X className="h-3.5 w-3.5" />}
                Ignorieren
              </button>
            </>
          )}

          {!isActive && (
            <button onClick={() => act("reopen")} disabled={acting !== null}
              className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50 transition-colors">
              {acting === "reopen" ? <Spinner /> : <Zap className="h-3.5 w-3.5" />}
              Wieder öffnen
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────

export default function AlertQueuePage() {
  const router = useRouter();

  const [alerts, setAlerts]                 = useState<AlertItem[]>([]);
  const [statusCounts, setStatusCounts]     = useState<Record<string, number>>({});
  const [openBySeverity, setOpenBySeverity] = useState<Record<string, number>>({});
  const [totalActive, setTotalActive]       = useState(0);
  const [loading, setLoading]               = useState(true);
  const [generating, setGenerating]         = useState(false);
  const [currentUserName, setCurrentUserName] = useState<string | null>(null);

  const [statusFilter,   setStatusFilter]   = useState<AlertStatus[]>(ACTIVE_STATUSES);
  const [severityFilter, setSeverityFilter] = useState<Severity[]>([]);
  const [typeFilter,     setTypeFilter]     = useState<AlertType[]>([]);
  const [showTypeFilter, setShowTypeFilter] = useState(false);

  // Fetch session for "assign to me" label
  useEffect(() => {
    fetch("/api/auth/session")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d && !d.error) setCurrentUserName(d.name); })
      .catch(() => {});
  }, []);

  const buildParams = useCallback(() => {
    const p = new URLSearchParams();
    p.set("status", statusFilter.join(",") || "open");
    if (severityFilter.length) p.set("severity", severityFilter.join(","));
    if (typeFilter.length)     p.set("type",     typeFilter.join(","));
    p.set("limit", "100");
    return p.toString();
  }, [statusFilter, severityFilter, typeFilter]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/ops/alerts?${buildParams()}`);
      if (res.status === 401) { router.push("/login"); return; }
      if (res.status === 403) { router.push("/dashboard"); return; }
      const data: QueueResponse = await res.json();
      setAlerts(data.alerts ?? []);
      setStatusCounts(data.statusCounts ?? {});
      setOpenBySeverity(data.openBySeverity ?? {});
      setTotalActive(data.totalActive ?? 0);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [router, buildParams]);

  useEffect(() => { load(); }, [load]);

  async function doAction(alertId: string, action: string) {
    const isTerminal = ["resolve", "dismiss"].includes(action);
    const notShowingTerminal =
      !statusFilter.includes("resolved") && !statusFilter.includes("dismissed");

    // Optimistic update
    if (isTerminal && notShowingTerminal) {
      setAlerts(prev => prev.filter(a => a.id !== alertId));
    } else {
      const statusMap: Record<string, AlertStatus> = {
        acknowledge: "acknowledged",
        start_review: "in_review",
        resolve: "resolved",
        dismiss: "dismissed",
        reopen: "open",
      };
      if (statusMap[action]) {
        setAlerts(prev => prev.map(a =>
          a.id === alertId ? { ...a, status: statusMap[action] } : a
        ));
      }
      if (action === "assign_self" && currentUserName) {
        setAlerts(prev => prev.map(a =>
          a.id === alertId ? { ...a, assigneeName: currentUserName } : a
        ));
      }
    }

    await fetch(`/api/ops/alerts/${alertId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });

    // Refresh counts (don't show full spinner on count refresh)
    const res = await fetch(`/api/ops/alerts?${buildParams()}`);
    if (res.ok) {
      const data: QueueResponse = await res.json();
      setStatusCounts(data.statusCounts ?? {});
      setOpenBySeverity(data.openBySeverity ?? {});
      setTotalActive(data.totalActive ?? 0);
    }
  }

  async function generateAlerts() {
    setGenerating(true);
    try {
      await fetch("/api/cron/generate-alerts", { method: "POST" });
      await load();
    } finally {
      setGenerating(false);
    }
  }

  const toggleStatus   = (s: AlertStatus) => setStatusFilter(p => p.includes(s) ? p.filter(x => x !== s) : [...p, s]);
  const toggleSeverity = (s: Severity)    => setSeverityFilter(p => p.includes(s) ? p.filter(x => x !== s) : [...p, s]);
  const toggleType     = (t: AlertType)   => setTypeFilter(p => p.includes(t) ? p.filter(x => x !== t) : [...p, t]);

  const activeCount   = (statusCounts.open ?? 0) + (statusCounts.acknowledged ?? 0) + (statusCounts.in_review ?? 0);
  const criticalCount = openBySeverity.critical ?? 0;

  return (
    <>
      <CutterNav />
      <main className="mx-auto max-w-4xl px-6 py-8 space-y-5">

        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold flex items-center gap-2">
                <AlertTriangle className="h-6 w-6" />
                Alert Queue
              </h1>
              {activeCount > 0 && (
                <span className={`flex h-6 items-center rounded-full px-2.5 text-xs font-bold ${
                  criticalCount > 0 ? "bg-red-500/15 text-red-400" : "bg-orange-500/15 text-orange-400"
                }`}>
                  {activeCount} aktiv
                </span>
              )}
            </div>
            {criticalCount > 0 && (
              <p className="text-sm text-red-400/80 mt-0.5 flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                {criticalCount} kritische{criticalCount !== 1 ? "" : "r"} Alert{criticalCount !== 1 ? "s" : ""}{" "}
                erfordern sofortige Aufmerksamkeit
              </p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={generateAlerts}
              disabled={generating || loading}
              title="Alle Videos prüfen und Alerts aktualisieren"
              className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50 transition-colors"
            >
              {generating ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Alerts generieren
            </button>
            <button
              onClick={load}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-foreground hover:bg-accent disabled:opacity-50 transition-colors"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {/* ── Severity overview ── */}
        <div className="flex items-center gap-2 flex-wrap">
          <FilterPill
            active={severityFilter.length === 0}
            onClick={() => setSeverityFilter([])}
            label="Alle Schweregrade"
            count={activeCount}
          />
          {ALL_SEVERITIES.map(sev => (
            <FilterPill
              key={sev}
              active={severityFilter.includes(sev)}
              onClick={() => toggleSeverity(sev)}
              label={SEVERITY_CONFIG[sev].label}
              count={openBySeverity[sev] ?? 0}
              dotClass={SEVERITY_CONFIG[sev].dotClass}
            />
          ))}
        </div>

        {/* ── Status filter + type toggle ── */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            {ALL_STATUSES.map(s => (
              <FilterPill
                key={s}
                active={statusFilter.includes(s)}
                onClick={() => toggleStatus(s)}
                label={STATUS_CONFIG[s].label}
                count={statusCounts[s] ?? 0}
              />
            ))}
          </div>
          <button
            onClick={() => setShowTypeFilter(p => !p)}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition-all ${
              showTypeFilter || typeFilter.length > 0
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:bg-accent"
            }`}
          >
            <Filter className="h-3.5 w-3.5" />
            Typen
            {typeFilter.length > 0 && (
              <span className="rounded-full bg-primary/20 px-1.5 py-0.5 text-[10px] font-bold text-primary leading-none">
                {typeFilter.length}
              </span>
            )}
          </button>
        </div>

        {/* ── Type filter ── */}
        {showTypeFilter && (
          <div className="flex items-center gap-1.5 flex-wrap rounded-xl border border-border bg-muted/20 p-3">
            <span className="text-xs text-muted-foreground mr-1">Typ:</span>
            {ALL_TYPES.map(t => (
              <FilterPill
                key={t}
                active={typeFilter.includes(t)}
                onClick={() => toggleType(t)}
                label={TYPE_LABELS[t]}
              />
            ))}
            {typeFilter.length > 0 && (
              <button onClick={() => setTypeFilter([])} className="text-xs text-muted-foreground/60 hover:text-muted-foreground ml-1">
                Zurücksetzen
              </button>
            )}
          </div>
        )}

        {/* ── Alert list ── */}
        {loading && alerts.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
            <RefreshCw className="h-5 w-5 animate-spin" />
            <span className="text-sm">Lade Alerts…</span>
          </div>
        ) : alerts.length === 0 ? (
          <div className="rounded-xl border border-border bg-card px-6 py-16 text-center">
            {totalActive === 0 ? (
              <>
                <Bell className="h-10 w-10 mx-auto mb-4 text-emerald-400/60" />
                <p className="font-semibold text-emerald-400">Alles in Ordnung!</p>
                <p className="text-sm text-muted-foreground mt-1 mb-5">
                  Keine offenen Alerts. Klicke auf &ldquo;Alerts generieren&rdquo; um alle Videos zu prüfen.
                </p>
                <button
                  onClick={generateAlerts}
                  disabled={generating}
                  className="flex items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground hover:bg-accent transition-colors mx-auto disabled:opacity-50"
                >
                  {generating ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  Alerts generieren
                </button>
              </>
            ) : (
              <>
                <Filter className="h-8 w-8 mx-auto mb-3 text-muted-foreground/20" />
                <p className="text-sm text-muted-foreground">Keine Alerts für die aktuelle Filterauswahl</p>
                <button
                  onClick={() => { setStatusFilter(ACTIVE_STATUSES); setSeverityFilter([]); setTypeFilter([]); }}
                  className="mt-3 text-xs text-primary hover:underline"
                >
                  Filter zurücksetzen
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground/60 px-0.5">
              {alerts.length} Alert{alerts.length !== 1 ? "s" : ""} · sortiert nach Schweregrad
              {loading && <RefreshCw className="inline h-3 w-3 animate-spin ml-1.5 opacity-40" />}
            </p>
            {alerts.map(alert => (
              <AlertCard
                key={alert.id}
                alert={alert}
                onAction={doAction}
                currentUserName={currentUserName}
              />
            ))}
          </div>
        )}

      </main>
    </>
  );
}
