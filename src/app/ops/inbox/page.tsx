"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CutterNav } from "@/components/cutter-nav";
import {
  RefreshCw, X, ChevronRight,
  AlertTriangle, ShieldAlert, Clock, FileCheck,
  UploadCloud, FileQuestion, Receipt, Flag,
  ArrowUpDown, ArrowUp, ArrowDown, Timer,
} from "lucide-react";
import { URGENCY_CFG, fmtStateAge, nextSlaIn, type UrgencyLevel } from "@/lib/urgency";

// ── Types ────────────────────────────────────────────────────────────
type InboxCategory =
  | "critical"
  | "proof_overdue"
  | "proof_waiting"
  | "suspicious"
  | "reupload"
  | "proof_missing"
  | "billing_ready"
  | "blocked";

type SuggestedAction =
  | "review_proof"
  | "request_proof"
  | "approve_proof"
  | "investigate"
  | "bill"
  | "wait_reupload"
  | "unflag";

type SortKey = "priority" | "newest" | "oldest" | "activity" | "views" | "urgency";
type SortDir = "asc" | "desc";

interface InboxItem {
  id: string;
  cutter_id: string | null;
  cutter_name: string | null;
  platform: string | null;
  url: string | null;
  title: string | null;
  claimed_views: number | null;
  current_views: number | null;
  unbilled_views: number;
  verification_status: string | null;
  discrepancy_status: string | null;
  discrepancy_percent: number | null;
  is_flagged: number;
  proof_status: string | null;
  proof_requested_at: string | null;
  proof_uploaded_at: string | null;
  created_at: string | null;
  last_activity_at: string | null;
  inbox_category: InboxCategory;
  state_age_hours: number;
  urgency: UrgencyLevel;
  priority_score: number;
  suggested_action: SuggestedAction;
}

interface InboxData {
  items: InboxItem[];
  summary: {
    total: number;
    critical: number;
    proof_waiting: number;
    proof_overdue: number;
    billing_ready: number;
    blocked: number;
    critical_delay: number;
    overdue: number;
  };
  breakdown: Record<string, number>;
  cutters: { id: string; name: string }[];
  platforms: string[];
}

// ── Category config ──────────────────────────────────────────────────
const CAT: Record<InboxCategory, {
  label: string;
  icon: React.ElementType;
  rowBorder: string;
  badge: string;
  dot: string;
}> = {
  critical:      { label: "Kritisch",         icon: ShieldAlert,   rowBorder: "border-l-red-500/70",    badge: "bg-red-500/10 text-red-400 border-red-500/20",       dot: "bg-red-400" },
  proof_overdue: { label: "Beleg überfällig", icon: Clock,          rowBorder: "border-l-orange-500/70", badge: "bg-orange-500/10 text-orange-400 border-orange-500/20", dot: "bg-orange-400" },
  proof_waiting: { label: "Beleg prüfen",     icon: FileCheck,      rowBorder: "border-l-amber-500/70",  badge: "bg-amber-500/10 text-amber-400 border-amber-500/20",  dot: "bg-amber-400" },
  suspicious:    { label: "Verdächtig",       icon: AlertTriangle,  rowBorder: "border-l-yellow-500/70", badge: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20", dot: "bg-yellow-400" },
  reupload:      { label: "Neu-Upload",       icon: UploadCloud,    rowBorder: "border-l-blue-500/50",   badge: "bg-blue-500/10 text-blue-400 border-blue-500/20",     dot: "bg-blue-400" },
  proof_missing: { label: "Beleg fehlt",      icon: FileQuestion,   rowBorder: "border-l-purple-500/50", badge: "bg-purple-500/10 text-purple-400 border-purple-500/20", dot: "bg-purple-400" },
  billing_ready: { label: "Abrechnungsbereit",icon: Receipt,        rowBorder: "border-l-emerald-500/50",badge: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20", dot: "bg-emerald-400" },
  blocked:       { label: "Blockiert",        icon: Flag,           rowBorder: "border-l-red-500/70",    badge: "bg-red-500/10 text-red-400 border-red-500/20",        dot: "bg-red-500" },
};

const CAT_ORDER: InboxCategory[] = [
  "critical", "proof_overdue", "proof_waiting",
  "suspicious", "reupload", "proof_missing",
  "billing_ready", "blocked",
];

// ── Suggestion config ────────────────────────────────────────────────
const SUGGESTION: Record<SuggestedAction, { label: string; cls: string; actionKey?: string }> = {
  review_proof:  { label: "Beleg prüfen",      cls: "bg-amber-500/10 text-amber-400 border-amber-500/25",   actionKey: undefined },
  request_proof: { label: "Beleg anfordern",   cls: "bg-orange-500/10 text-orange-400 border-orange-500/25", actionKey: "request_proof" },
  approve_proof: { label: "Genehmigen",        cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/25", actionKey: "approve_proof" },
  investigate:   { label: "Untersuchen",       cls: "bg-yellow-500/10 text-yellow-400 border-yellow-500/25", actionKey: undefined },
  bill:          { label: "Abrechnen",         cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/25", actionKey: undefined },
  wait_reupload: { label: "Warten",            cls: "bg-blue-500/10 text-blue-400 border-blue-500/25",      actionKey: undefined },
  unflag:        { label: "Entsperren",        cls: "bg-muted/30 text-muted-foreground border-border",      actionKey: "unflag" },
};

const PROOF_STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  proof_submitted:          { label: "Eingereicht",     cls: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
  proof_under_review:       { label: "In Prüfung",      cls: "bg-purple-500/10 text-purple-400 border-purple-500/20" },
  proof_approved:           { label: "✓ Genehmigt",     cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
  proof_rejected:           { label: "✕ Abgelehnt",     cls: "bg-red-500/10 text-red-400 border-red-500/20" },
  proof_requested:          { label: "Angefordert",     cls: "bg-orange-500/10 text-orange-400 border-orange-500/20" },
  proof_reupload_requested: { label: "↩ Neu einreichen",cls: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
};

const DISC_LABEL: Record<string, { label: string; cls: string }> = {
  match:                 { label: "✓ Match",      cls: "text-emerald-400" },
  minor_difference:      { label: "Gering",       cls: "text-yellow-400/70" },
  suspicious_difference: { label: "⚠ Verdächtig", cls: "text-yellow-400" },
  critical_difference:   { label: "✕ Kritisch",   cls: "text-red-400" },
  no_data:               { label: "Keine Daten",  cls: "text-muted-foreground/40" },
};

const PLATFORM_SHORT: Record<string, string> = {
  youtube: "YT", tiktok: "TT", instagram: "IG", facebook: "FB",
};
const PLATFORM_CLS: Record<string, string> = {
  youtube:   "bg-red-500/10 text-red-400",
  tiktok:    "bg-cyan-500/10 text-cyan-400",
  instagram: "bg-pink-500/10 text-pink-400",
  facebook:  "bg-blue-500/10 text-blue-400",
};

// ── Helpers ──────────────────────────────────────────────────────────
function fmtNum(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return new Intl.NumberFormat("de-DE").format(n);
}

function fmtAge(iso: string | null): string {
  if (!iso) return "—";
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (m < 2)   return "jetzt";
  if (m < 60)  return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h`;
  const d = Math.floor(h / 24);
  if (d === 1) return "gestern";
  if (d < 7)   return `${d}T`;
  return new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
}

// ── Sortable column header ───────────────────────────────────────────
function SortTh({
  col, label, sortKey, sortDir, onSort,
}: {
  col: SortKey; label: string; sortKey: SortKey; sortDir: SortDir; onSort: (k: SortKey) => void;
}) {
  const active = sortKey === col;
  return (
    <th
      className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide cursor-pointer select-none hover:text-foreground transition-colors whitespace-nowrap"
      onClick={() => onSort(col)}
    >
      <span className="flex items-center gap-1">
        {label}
        {active
          ? sortDir === "asc"
            ? <ArrowUp className="h-3 w-3 text-primary" />
            : <ArrowDown className="h-3 w-3 text-primary" />
          : <ArrowUpDown className="h-3 w-3 opacity-25" />
        }
      </span>
    </th>
  );
}

// ── Bulk action bar ──────────────────────────────────────────────────
function BulkBar({
  count, busy, onClear, onAction,
}: {
  count: number; busy: boolean;
  onClear: () => void;
  onAction: (action: string, reason?: string) => void;
}) {
  const [showReject, setShowReject] = useState(false);
  const [reason, setReason]         = useState("");

  if (count === 0) return null;
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card/95 backdrop-blur-sm shadow-xl">
      <div className="mx-auto max-w-7xl flex items-center gap-3 px-6 py-3 flex-wrap">
        <span className="text-sm font-semibold shrink-0">{count} ausgewählt</span>
        <div className="flex items-center gap-2 flex-1 flex-wrap">
          <button disabled={busy} onClick={() => onAction("approve_proof")}
            className="rounded-md border border-emerald-500/25 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-40 transition-colors">
            ✓ Genehmigen
          </button>
          <button disabled={busy} onClick={() => onAction("request_proof")}
            className="rounded-md border border-orange-500/25 bg-orange-500/10 px-3 py-1.5 text-xs font-medium text-orange-400 hover:bg-orange-500/20 disabled:opacity-40 transition-colors">
            Beleg anfordern
          </button>
          <button disabled={busy} onClick={() => onAction("mark_reviewed")}
            className="rounded-md border border-border bg-muted/20 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent disabled:opacity-40 transition-colors">
            Als geprüft
          </button>
          <button disabled={busy} onClick={() => setShowReject(v => !v)}
            className="rounded-md border border-red-500/25 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/20 disabled:opacity-40 transition-colors">
            ✕ Ablehnen…
          </button>
          {showReject && (
            <div className="flex items-center gap-2">
              <input type="text" placeholder="Grund (optional)" value={reason}
                onChange={e => setReason(e.target.value)}
                className="rounded border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring w-44" />
              <button disabled={busy}
                onClick={() => { onAction("reject_proof", reason); setShowReject(false); setReason(""); }}
                className="rounded-md border border-red-500/30 bg-red-500/15 px-2.5 py-1 text-xs font-medium text-red-400 hover:bg-red-500/25 disabled:opacity-40">
                Bestätigen
              </button>
            </div>
          )}
        </div>
        <button onClick={onClear}
          className="ml-auto shrink-0 rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
          <X className="h-4 w-4" />
        </button>
        {busy && <RefreshCw className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      </div>
    </div>
  );
}

// ── Quick action button ──────────────────────────────────────────────
function QuickAction({
  item, onAction, busy,
}: {
  item: InboxItem;
  onAction: (id: string, action: string, reason?: string) => void;
  busy: string | null;
}) {
  const s   = SUGGESTION[item.suggested_action];
  const isBusy = busy === item.id;

  // Only show an inline button when the action is directly executable
  if (!s.actionKey) return null;

  return (
    <button
      disabled={!!busy}
      onClick={e => { e.stopPropagation(); onAction(item.id, s.actionKey!); }}
      className={`rounded-md border px-2 py-1 text-xs font-medium transition-colors disabled:opacity-40 ${s.cls} hover:opacity-80 whitespace-nowrap`}
    >
      {isBusy ? <RefreshCw className="h-3 w-3 animate-spin inline" /> : s.label}
    </button>
  );
}

// ── Main page ────────────────────────────────────────────────────────
export default function InboxPage() {
  const router = useRouter();

  const [data,       setData]       = useState<InboxData | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [selected,   setSelected]   = useState<Set<string>>(new Set());
  const [bulkBusy,   setBulkBusy]   = useState(false);
  const [quickBusy,  setQuickBusy]  = useState<string | null>(null);
  const [toast,      setToast]      = useState<{ msg: string; ok: boolean } | null>(null);

  // Filters (all client-side after one fetch)
  const [filterCat,      setFilterCat]      = useState<InboxCategory | "all">("all");
  const [filterPlatform, setFilterPlatform] = useState<string>("all");
  const [filterCutter,   setFilterCutter]   = useState<string>("all");
  const [sortKey,        setSortKey]        = useState<SortKey>("priority");
  const [sortDir,        setSortDir]        = useState<SortDir>("desc");

  // ── Load ────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/ops/inbox");
    if (res.status === 401) { router.push("/login"); return; }
    if (res.status === 403) { router.push("/dashboard"); return; }
    setData(await res.json());
    setLoading(false);
  }, [router]);

  useEffect(() => { load(); }, [load]);

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  // ── Sort handler (toggle dir if same key) ───────────────────────
  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  }

  // ── Filtered + sorted items ──────────────────────────────────────
  const visible = useMemo(() => {
    if (!data) return [];
    let items = data.items;

    if (filterCat !== "all")      items = items.filter(i => i.inbox_category === filterCat);
    if (filterPlatform !== "all") items = items.filter(i => i.platform === filterPlatform);
    if (filterCutter !== "all")   items = items.filter(i => i.cutter_id === filterCutter);

    const URGENCY_ORDER: Record<UrgencyLevel, number> = {
      critical_delay: 3, overdue: 2, attention_needed: 1, on_track: 0,
    };
    const dir = sortDir === "asc" ? 1 : -1;
    return [...items].sort((a, b) => {
      switch (sortKey) {
        case "priority": return dir * (b.priority_score - a.priority_score);
        case "newest":   return dir * (new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime());
        case "oldest":   return dir * (new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime());
        case "activity": return dir * (new Date(b.last_activity_at ?? 0).getTime() - new Date(a.last_activity_at ?? 0).getTime());
        case "views":    return dir * ((b.current_views ?? 0) - (a.current_views ?? 0));
        case "urgency":  return dir * (URGENCY_ORDER[b.urgency] - URGENCY_ORDER[a.urgency]);
        default:         return 0;
      }
    });
  }, [data, filterCat, filterPlatform, filterCutter, sortKey, sortDir]);

  // ── Selection helpers ────────────────────────────────────────────
  function toggleItem(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  function toggleAll() {
    const visibleIds = visible.map(i => i.id);
    const allSel = visibleIds.every(id => selected.has(id));
    setSelected(prev => {
      const next = new Set(prev);
      if (allSel) visibleIds.forEach(id => next.delete(id));
      else visibleIds.forEach(id => next.add(id));
      return next;
    });
  }

  // ── Bulk action ──────────────────────────────────────────────────
  async function runBulk(action: string, reason?: string) {
    if (selected.size === 0) return;
    setBulkBusy(true);
    try {
      const res = await fetch("/api/ops/clips/bulk", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ clipIds: Array.from(selected), action, reason }),
      });
      const json = await res.json();
      if (res.ok) {
        setToast({ msg: `${json.processed} Clip${json.processed !== 1 ? "s" : ""} aktualisiert`, ok: true });
        setSelected(new Set());
        await load();
      } else {
        setToast({ msg: json.error ?? "Fehler", ok: false });
      }
    } catch {
      setToast({ msg: "Netzwerkfehler", ok: false });
    } finally {
      setBulkBusy(false);
    }
  }

  // ── Quick single-clip action ─────────────────────────────────────
  async function runQuick(id: string, action: string, reason?: string) {
    setQuickBusy(id);
    try {
      const res = await fetch("/api/ops/clips/bulk", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ clipIds: [id], action, reason }),
      });
      const json = await res.json();
      if (res.ok) {
        setToast({ msg: "Aktualisiert", ok: true });
        await load();
      } else {
        setToast({ msg: json.error ?? "Fehler", ok: false });
      }
    } catch {
      setToast({ msg: "Netzwerkfehler", ok: false });
    } finally {
      setQuickBusy(null);
    }
  }

  const allVisibleSelected =
    visible.length > 0 && visible.every(i => selected.has(i.id));
  const someVisibleSelected = visible.some(i => selected.has(i.id));

  const { summary, breakdown } = data ?? { summary: null, breakdown: {} };

  return (
    <>
      <CutterNav />

      <main className="mx-auto max-w-7xl px-6 py-8 space-y-5 pb-24">

        {/* ── Header ──────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Ops Inbox</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {summary
                ? `${summary.total} Clip${summary.total !== 1 ? "s" : ""} brauchen Aktion`
                : "Lade Inbox…"}
            </p>
          </div>
          <button onClick={load} disabled={loading}
            className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-40 transition-colors">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Aktualisieren
          </button>
        </div>

        {/* ── Summary chips ────────────────────────────────────────── */}
        {summary && (
          <div className="flex flex-wrap gap-2">
            {summary.critical_delay > 0 && (
              <span className="flex items-center gap-1.5 rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1 text-xs font-medium text-red-400">
                <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                {summary.critical_delay} kritisch verzögert
              </span>
            )}
            {summary.overdue > 0 && (
              <span className="flex items-center gap-1.5 rounded-full border border-orange-500/25 bg-orange-500/8 px-3 py-1 text-xs font-medium text-orange-400">
                <Timer className="h-3 w-3" />
                {summary.overdue} überfällig
              </span>
            )}
            {summary.critical > 0 && (
              <button onClick={() => setFilterCat(filterCat === "critical" ? "all" : "critical")}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${filterCat === "critical" ? "bg-red-500/20 border-red-500/40 text-red-300" : "bg-red-500/8 border-red-500/20 text-red-400 hover:bg-red-500/15"}`}>
                <ShieldAlert className="h-3 w-3" />
                Kritisch
                <span className="font-bold ml-0.5">{summary.critical}</span>
              </button>
            )}
            {summary.proof_waiting > 0 && (
              <button onClick={() => setFilterCat(filterCat === "proof_waiting" ? "all" : "proof_waiting")}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${filterCat === "proof_waiting" ? "bg-amber-500/20 border-amber-500/40 text-amber-300" : "bg-amber-500/8 border-amber-500/20 text-amber-400 hover:bg-amber-500/15"}`}>
                <FileCheck className="h-3 w-3" />
                Beleg prüfen
                <span className="font-bold ml-0.5">{summary.proof_waiting}</span>
              </button>
            )}
            {summary.proof_overdue > 0 && (
              <button onClick={() => setFilterCat(filterCat === "proof_overdue" ? "all" : "proof_overdue")}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${filterCat === "proof_overdue" ? "bg-orange-500/20 border-orange-500/40 text-orange-300" : "bg-orange-500/8 border-orange-500/20 text-orange-400 hover:bg-orange-500/15"}`}>
                <Clock className="h-3 w-3" />
                Überfällig
                <span className="font-bold ml-0.5">{summary.proof_overdue}</span>
              </button>
            )}
            {summary.billing_ready > 0 && (
              <button onClick={() => setFilterCat(filterCat === "billing_ready" ? "all" : "billing_ready")}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${filterCat === "billing_ready" ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-300" : "bg-emerald-500/8 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/15"}`}>
                <Receipt className="h-3 w-3" />
                Abrechnungsbereit
                <span className="font-bold ml-0.5">{summary.billing_ready}</span>
              </button>
            )}
            {summary.blocked > 0 && (
              <button onClick={() => setFilterCat(filterCat === "blocked" ? "all" : "blocked")}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${filterCat === "blocked" ? "bg-red-500/20 border-red-500/40 text-red-300" : "bg-red-500/8 border-red-500/20 text-red-400 hover:bg-red-500/15"}`}>
                <Flag className="h-3 w-3" />
                Blockiert
                <span className="font-bold ml-0.5">{summary.blocked}</span>
              </button>
            )}
          </div>
        )}

        {/* ── Filter bar ───────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Category tabs */}
          <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/20 p-1">
            <button
              onClick={() => setFilterCat("all")}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${filterCat === "all" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
              Alle {data ? `(${data.items.length})` : ""}
            </button>
            {CAT_ORDER.filter(c => (breakdown[c] ?? 0) > 0).map(c => {
              const cfg = CAT[c];
              const Icon = cfg.icon;
              return (
                <button key={c}
                  onClick={() => setFilterCat(filterCat === c ? "all" : c)}
                  className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${filterCat === c ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                  <Icon className="h-3 w-3" />
                  {cfg.label}
                  <span className="tabular-nums opacity-60">({breakdown[c]})</span>
                </button>
              );
            })}
          </div>

          <div className="flex-1" />

          {/* Platform filter */}
          {(data?.platforms?.length ?? 0) > 1 && (
            <select
              value={filterPlatform}
              onChange={e => setFilterPlatform(e.target.value)}
              className="rounded-md border border-border bg-card px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring">
              <option value="all">Alle Plattformen</option>
              {(data?.platforms ?? []).map(p => (
                <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
              ))}
            </select>
          )}

          {/* Cutter filter */}
          {(data?.cutters?.length ?? 0) > 1 && (
            <select
              value={filterCutter}
              onChange={e => setFilterCutter(e.target.value)}
              className="rounded-md border border-border bg-card px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring">
              <option value="all">Alle Cutter</option>
              {(data?.cutters ?? []).map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          )}
        </div>

        {/* ── Loading ──────────────────────────────────────────────── */}
        {loading && (
          <div className="flex items-center justify-center py-24 text-muted-foreground/40 gap-2">
            <RefreshCw className="h-4 w-4 animate-spin" />
            <span className="text-sm">Lade Inbox…</span>
          </div>
        )}

        {/* ── Empty state ──────────────────────────────────────────── */}
        {!loading && visible.length === 0 && (
          <div className="rounded-xl border border-border bg-card flex flex-col items-center py-20 text-center gap-3">
            <FileCheck className="h-10 w-10 text-emerald-400/30" />
            <p className="text-sm font-medium">Inbox leer</p>
            <p className="text-xs text-muted-foreground max-w-xs">
              {filterCat !== "all" || filterPlatform !== "all" || filterCutter !== "all"
                ? "Keine Clips für diese Filter."
                : "Kein Clip braucht aktuell Aktion."}
            </p>
          </div>
        )}

        {/* ── Table ────────────────────────────────────────────────── */}
        {!loading && visible.length > 0 && (
          <div className="rounded-xl border border-border bg-card overflow-hidden">

            {/* Result count */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/60 bg-muted/10">
              <span className="text-xs text-muted-foreground tabular-nums">
                {visible.length} Ergebnis{visible.length !== 1 ? "se" : ""}
                {selected.size > 0 && <span className="ml-2 text-foreground font-medium">· {selected.size} ausgewählt</span>}
              </span>
              {selected.size > 0 && (
                <button onClick={() => setSelected(new Set())}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                  Auswahl aufheben
                </button>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/5">
                    {/* Checkbox-all */}
                    <th className="w-10 px-3 py-2.5">
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        ref={el => { if (el) el.indeterminate = someVisibleSelected && !allVisibleSelected; }}
                        onChange={toggleAll}
                        className="rounded border-border h-3.5 w-3.5 accent-primary"
                      />
                    </th>
                    <th className="px-2 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide w-8">Pl.</th>
                    {/* Clip */}
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Clip / Cutter</th>
                    {/* Sortable columns */}
                    <SortTh col="views"    label="Claimed"   sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                    <SortTh col="views"    label="Verifiziert" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide whitespace-nowrap">Beleg</th>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide whitespace-nowrap">Differenz</th>
                    <th className="px-3 py-2.5 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide whitespace-nowrap">Abrechn.</th>
                    <SortTh col="urgency"  label="SLA-Alter" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                    <SortTh col="activity" label="Aktivität" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide whitespace-nowrap">Aktion</th>
                    <th className="w-10" />
                  </tr>
                </thead>

                <tbody className="divide-y divide-border/40">
                  {visible.map(item => {
                    const cat     = CAT[item.inbox_category];
                    const catIcon = cat.icon;
                    const proofCfg = item.proof_status ? PROOF_STATUS_LABEL[item.proof_status] : null;
                    const discCfg  = item.discrepancy_status ? DISC_LABEL[item.discrepancy_status] : null;
                    const isSel    = selected.has(item.id);

                    return (
                      <tr
                        key={item.id}
                        className={`border-l-2 ${cat.rowBorder} transition-colors ${
                          isSel
                            ? "bg-primary/5"
                            : `hover:bg-accent/15 ${URGENCY_CFG[item.urgency ?? "on_track"]?.rowCls ?? ""}`
                        }`}
                      >
                        {/* Checkbox */}
                        <td className="px-3 py-3">
                          <input
                            type="checkbox"
                            checked={isSel}
                            onChange={() => toggleItem(item.id)}
                            className="rounded border-border h-3.5 w-3.5 accent-primary"
                          />
                        </td>

                        {/* Platform */}
                        <td className="px-2 py-3">
                          {item.platform && (
                            <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${PLATFORM_CLS[item.platform] ?? "bg-muted text-muted-foreground"}`}>
                              {PLATFORM_SHORT[item.platform] ?? item.platform}
                            </span>
                          )}
                        </td>

                        {/* Clip + cutter */}
                        <td className="px-3 py-3 max-w-[220px]">
                          <p className="font-medium truncate text-foreground leading-snug" title={item.title ?? undefined}>
                            {item.title ?? <span className="text-muted-foreground/50 font-mono text-xs">{item.id.slice(0, 8)}</span>}
                          </p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className={`inline-block h-1.5 w-1.5 rounded-full shrink-0 ${cat.dot}`} />
                            <span className="text-muted-foreground truncate">{item.cutter_name ?? "—"}</span>
                          </div>
                        </td>

                        {/* Claimed views */}
                        <td className="px-3 py-3 text-right tabular-nums text-muted-foreground whitespace-nowrap">
                          {fmtNum(item.claimed_views)}
                        </td>

                        {/* Verified views (current_views from scraper/API) */}
                        <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap">
                          {item.current_views != null
                            ? <span className="text-foreground/80">{fmtNum(item.current_views)}</span>
                            : <span className="text-muted-foreground/30">—</span>
                          }
                        </td>

                        {/* Proof status */}
                        <td className="px-3 py-3 whitespace-nowrap">
                          {proofCfg
                            ? <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-medium ${proofCfg.cls}`}>{proofCfg.label}</span>
                            : <span className="text-muted-foreground/30">—</span>
                          }
                        </td>

                        {/* Discrepancy */}
                        <td className="px-3 py-3 whitespace-nowrap">
                          {discCfg
                            ? (
                              <span className={`text-xs font-medium ${discCfg.cls}`}>
                                {discCfg.label}
                                {item.discrepancy_percent != null && Math.abs(item.discrepancy_percent) > 0.5 && (
                                  <span className="ml-1 text-muted-foreground/50 tabular-nums">
                                    {item.discrepancy_percent > 0 ? "+" : ""}{item.discrepancy_percent.toFixed(0)}%
                                  </span>
                                )}
                              </span>
                            )
                            : <span className="text-muted-foreground/30">—</span>
                          }
                        </td>

                        {/* Billing readiness */}
                        <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap">
                          {item.unbilled_views > 0
                            ? <span className="text-emerald-400 font-medium">{fmtNum(item.unbilled_views)}</span>
                            : <span className="text-muted-foreground/25">—</span>
                          }
                        </td>

                        {/* SLA state age */}
                        <td className="px-3 py-3 whitespace-nowrap">
                          {item.state_age_hours != null ? (
                            <span
                              className={`tabular-nums text-xs font-medium ${URGENCY_CFG[item.urgency]?.ageCls ?? "text-muted-foreground/50"}`}
                              title={nextSlaIn(item.inbox_category, item.state_age_hours) ?? "Maximale Eskalation"}
                            >
                              {fmtStateAge(item.state_age_hours)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/30">—</span>
                          )}
                        </td>

                        {/* Last activity */}
                        <td className="px-3 py-3 whitespace-nowrap text-muted-foreground">
                          {fmtAge(item.last_activity_at)}
                        </td>

                        {/* Suggested action + quick button */}
                        <td className="px-3 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            {/* Category badge */}
                            {(() => {
                              const Icon = catIcon;
                              return (
                                <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs font-medium ${cat.badge}`}>
                                  <Icon className="h-2.5 w-2.5" />
                                  {cat.label}
                                </span>
                              );
                            })()}
                            {/* Quick action button (only for directly executable actions) */}
                            <QuickAction item={item} onAction={runQuick} busy={quickBusy} />
                          </div>
                        </td>

                        {/* Open link */}
                        <td className="px-3 py-3">
                          <Link
                            href={`/ops/clips/${item.id}`}
                            className="flex items-center justify-center rounded-md border border-border bg-muted/10 p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                            title="Clip öffnen"
                          >
                            <ChevronRight className="h-3.5 w-3.5" />
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

      {/* Bulk action bar */}
      <BulkBar
        count={selected.size}
        busy={bulkBusy}
        onClear={() => setSelected(new Set())}
        onAction={runBulk}
      />

      {/* Toast */}
      {toast && (
        <div className={`fixed top-5 right-5 z-50 rounded-lg border px-4 py-3 text-sm font-medium shadow-lg ${
          toast.ok
            ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-400"
            : "bg-red-500/10 border-red-500/25 text-red-400"
        }`}>
          {toast.msg}
        </div>
      )}
    </>
  );
}
