"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CutterNav } from "@/components/cutter-nav";
import {
  RefreshCw, CheckCircle2, ChevronRight, X,
  AlertTriangle, ShieldAlert, Clock, FileQuestion,
  UploadCloud, CheckCheck, Receipt, ChevronDown, ChevronUp,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────
type QueueGroup =
  | "critical"
  | "proof_overdue"
  | "reupload_pending"
  | "proof_waiting"
  | "suspicious"
  | "no_proof"
  | "billing_ready"
  | "review_ready";

type SuggestedAction =
  | "review_proof"
  | "request_proof"
  | "investigate"
  | "bill"
  | "wait_reupload"
  | "approve"
  | "none";

interface QueueItem {
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
  created_at: string | null;
  queue_group: QueueGroup;
  priority_score: number;
  suggested_action: SuggestedAction;
}

interface QueueData {
  items: QueueItem[];
  groupCounts: Record<string, number>;
  total: number;
}

// ── Group config ─────────────────────────────────────────────────────
const GROUP_CONFIG: Record<QueueGroup, {
  label: string;
  description: string;
  icon: React.ElementType;
  color: string;
  borderColor: string;
  badgeColor: string;
  order: number;
}> = {
  critical:         { label: "Kritische Differenz",     description: "Starke Abweichung — Beleg oder Erklärung nötig", icon: ShieldAlert,   color: "text-red-400",    borderColor: "border-red-500/30",    badgeColor: "bg-red-500/10 text-red-400 border-red-500/20",    order: 1 },
  proof_overdue:    { label: "Beleg überfällig",        description: "Beleg angefordert, aber seit > 48 h ausstehend",  icon: Clock,          color: "text-orange-400", borderColor: "border-orange-500/30", badgeColor: "bg-orange-500/10 text-orange-400 border-orange-500/20", order: 2 },
  proof_waiting:    { label: "Beleg eingereicht",       description: "Beleg liegt vor — Admin-Prüfung erforderlich",    icon: FileQuestion,   color: "text-amber-400",  borderColor: "border-amber-500/30",  badgeColor: "bg-amber-500/10 text-amber-400 border-amber-500/20",  order: 3 },
  suspicious:       { label: "Verdächtige Differenz",   description: "Verdächtige Abweichung — manuell prüfen",         icon: AlertTriangle,  color: "text-yellow-400", borderColor: "border-yellow-500/30", badgeColor: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20", order: 4 },
  reupload_pending: { label: "Neu-Upload angefordert",  description: "Warten auf neuen Beleg vom Cutter",               icon: UploadCloud,    color: "text-blue-400",   borderColor: "border-blue-500/30",   badgeColor: "bg-blue-500/10 text-blue-400 border-blue-500/20",   order: 5 },
  no_proof:         { label: "Beleg ausstehend",        description: "Beleg angefordert — Cutter hat noch nicht hochgeladen", icon: FileQuestion, color: "text-purple-400", borderColor: "border-purple-500/30", badgeColor: "bg-purple-500/10 text-purple-400 border-purple-500/20", order: 6 },
  billing_ready:    { label: "Abrechnungsbereit",       description: "Verifiziert mit unabgerechneten Views",           icon: Receipt,        color: "text-emerald-400", borderColor: "border-emerald-500/30", badgeColor: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20", order: 7 },
  review_ready:     { label: "Zur Freigabe",            description: "Kann als geprüft markiert werden",                icon: CheckCheck,     color: "text-muted-foreground", borderColor: "border-border", badgeColor: "bg-muted/40 text-muted-foreground border-border", order: 8 },
};

const SUGGESTION_CONFIG: Record<SuggestedAction, { label: string; cls: string }> = {
  review_proof:  { label: "→ Prüfen",          cls: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
  request_proof: { label: "→ Beleg anfordern", cls: "bg-orange-500/10 text-orange-400 border-orange-500/20" },
  investigate:   { label: "→ Untersuchen",     cls: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20" },
  bill:          { label: "→ Abrechnen",       cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
  wait_reupload: { label: "→ Warten",          cls: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
  approve:       { label: "→ Genehmigen",      cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
  none:          { label: "—",                 cls: "bg-muted/30 text-muted-foreground border-border" },
};

const PLATFORM_LABELS: Record<string, string> = {
  youtube: "YT", tiktok: "TT", instagram: "IG", facebook: "FB",
};
const PLATFORM_COLORS: Record<string, string> = {
  youtube: "bg-red-500/10 text-red-400", tiktok: "bg-cyan-500/10 text-cyan-400",
  instagram: "bg-pink-500/10 text-pink-400", facebook: "bg-blue-500/10 text-blue-400",
};

// ── Helpers ──────────────────────────────────────────────────────────
function formatNum(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return new Intl.NumberFormat("de-DE").format(n);
}

function formatAge(iso: string | null): string {
  if (!iso) return "";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days === 0) return "heute";
  if (days === 1) return "gestern";
  return `${days}T`;
}

// ── Bulk action bar ──────────────────────────────────────────────────
function BulkBar({
  count,
  onClear,
  onAction,
  busy,
}: {
  count: number;
  onClear: () => void;
  onAction: (action: string, reason?: string) => void;
  busy: boolean;
}) {
  const [rejectReason, setRejectReason] = useState("");
  const [showReject,   setShowReject]   = useState(false);

  if (count === 0) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card/95 backdrop-blur-sm shadow-2xl">
      <div className="mx-auto max-w-6xl flex items-center gap-3 px-6 py-3 flex-wrap">
        <span className="text-sm font-medium text-foreground shrink-0">
          {count} ausgewählt
        </span>
        <div className="flex items-center gap-2 flex-wrap flex-1">
          <button
            disabled={busy}
            onClick={() => onAction("approve_proof")}
            className="rounded-md border border-emerald-500/25 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-40 transition-colors"
          >
            ✓ Belege genehmigen
          </button>
          <button
            disabled={busy}
            onClick={() => onAction("request_proof")}
            className="rounded-md border border-orange-500/25 bg-orange-500/10 px-3 py-1.5 text-xs font-medium text-orange-400 hover:bg-orange-500/20 disabled:opacity-40 transition-colors"
          >
            Beleg anfordern
          </button>
          <button
            disabled={busy}
            onClick={() => onAction("mark_reviewed")}
            className="rounded-md border border-border bg-muted/20 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent disabled:opacity-40 transition-colors"
          >
            Als geprüft markieren
          </button>
          <button
            disabled={busy}
            onClick={() => setShowReject(v => !v)}
            className="rounded-md border border-red-500/25 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/20 disabled:opacity-40 transition-colors"
          >
            ✕ Ablehnen…
          </button>
          {showReject && (
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Ablehnungsgrund (optional)"
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                className="rounded border border-border bg-background px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-red-500/50 w-48"
              />
              <button
                disabled={busy}
                onClick={() => { onAction("reject_proof", rejectReason); setShowReject(false); setRejectReason(""); }}
                className="rounded-md border border-red-500/30 bg-red-500/15 px-2.5 py-1 text-xs font-medium text-red-400 hover:bg-red-500/25 disabled:opacity-40"
              >
                Bestätigen
              </button>
            </div>
          )}
        </div>
        <button
          onClick={onClear}
          className="ml-auto shrink-0 rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          title="Auswahl aufheben"
        >
          <X className="h-4 w-4" />
        </button>
        {busy && <RefreshCw className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      </div>
    </div>
  );
}

// ── Queue group section ──────────────────────────────────────────────
function GroupSection({
  group,
  items,
  selected,
  onToggle,
  onSelectAll,
}: {
  group: QueueGroup;
  items: QueueItem[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onSelectAll: (ids: string[]) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const cfg = GROUP_CONFIG[group];
  const Icon = cfg.icon;
  const allSelected = items.every(i => selected.has(i.id));
  const anySelected = items.some(i => selected.has(i.id));

  return (
    <div className={`rounded-xl border ${cfg.borderColor} bg-card overflow-hidden`}>
      {/* Section header */}
      <div
        className="flex items-center gap-3 px-5 py-3 cursor-pointer select-none hover:bg-accent/30 transition-colors"
        onClick={() => setCollapsed(v => !v)}
      >
        <input
          type="checkbox"
          checked={allSelected && items.length > 0}
          ref={el => { if (el) el.indeterminate = anySelected && !allSelected; }}
          onClick={e => e.stopPropagation()}
          onChange={() => onSelectAll(items.map(i => i.id))}
          className="rounded border-border h-3.5 w-3.5 accent-primary shrink-0"
        />
        <Icon className={`h-4 w-4 shrink-0 ${cfg.color}`} />
        <div className="flex-1 min-w-0">
          <span className="text-sm font-semibold">{cfg.label}</span>
          <span className="ml-2 text-xs text-muted-foreground">{cfg.description}</span>
        </div>
        <span className={`rounded-full border px-2 py-0.5 text-xs font-medium tabular-nums ${cfg.badgeColor}`}>
          {items.length}
        </span>
        {collapsed
          ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          : <ChevronUp className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        }
      </div>

      {/* Clip rows */}
      {!collapsed && (
        <div className="divide-y divide-border/40">
          {items.map(item => (
            <ClipRow
              key={item.id}
              item={item}
              selected={selected.has(item.id)}
              onToggle={() => onToggle(item.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Clip row ─────────────────────────────────────────────────────────
function ClipRow({
  item,
  selected,
  onToggle,
}: {
  item: QueueItem;
  selected: boolean;
  onToggle: () => void;
}) {
  const suggestion = SUGGESTION_CONFIG[item.suggested_action];

  return (
    <div className={`flex items-center gap-3 px-5 py-3 transition-colors ${selected ? "bg-primary/5" : "hover:bg-accent/20"}`}>
      {/* Checkbox */}
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggle}
        className="rounded border-border h-3.5 w-3.5 accent-primary shrink-0"
      />

      {/* Platform */}
      {item.platform && (
        <span className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-medium ${PLATFORM_COLORS[item.platform] ?? "bg-muted text-muted-foreground"}`}>
          {PLATFORM_LABELS[item.platform] ?? item.platform}
        </span>
      )}

      {/* Title + cutter */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate leading-snug">
          {item.title ?? item.url ?? item.id.slice(0, 8)}
        </p>
        <p className="text-xs text-muted-foreground truncate">
          {item.cutter_name ?? "—"}
          {item.current_views != null && (
            <span className="ml-2 tabular-nums">{formatNum(item.current_views)} Views</span>
          )}
          {item.unbilled_views > 0 && (
            <span className="ml-1 text-emerald-400/70">· {formatNum(item.unbilled_views)} unbillings</span>
          )}
        </p>
      </div>

      {/* Priority score */}
      <div className="shrink-0 text-right hidden sm:block">
        <span className={`text-xs font-mono tabular-nums ${
          item.priority_score >= 40 ? "text-red-400" :
          item.priority_score >= 20 ? "text-orange-400" :
          item.priority_score >= 10 ? "text-yellow-400" :
          "text-muted-foreground/40"
        }`}>
          {item.priority_score > 0 ? `P${item.priority_score}` : ""}
        </span>
        <p className="text-xs text-muted-foreground/50">{formatAge(item.created_at)}</p>
      </div>

      {/* Suggested action */}
      {item.suggested_action !== "none" && (
        <span className={`shrink-0 rounded-md border px-2 py-0.5 text-xs font-medium hidden md:block ${suggestion.cls}`}>
          {suggestion.label}
        </span>
      )}

      {/* Open detail */}
      <Link
        href={`/ops/clips/${item.id}`}
        className="shrink-0 flex items-center gap-0.5 rounded-md border border-border bg-card px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
      >
        Öffnen <ChevronRight className="h-3 w-3" />
      </Link>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────
const GROUP_ORDER: QueueGroup[] = [
  "critical", "proof_overdue", "proof_waiting",
  "suspicious", "reupload_pending", "no_proof",
  "billing_ready", "review_ready",
];

export default function QueuePage() {
  const router  = useRouter();
  const [data,     setData]     = useState<QueueData | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy,     setBusy]     = useState(false);
  const [toast,    setToast]    = useState<{ msg: string; ok: boolean } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/ops/queue");
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

  function toggleItem(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll(ids: string[]) {
    const allSelected = ids.every(id => selected.has(id));
    setSelected(prev => {
      const next = new Set(prev);
      if (allSelected) ids.forEach(id => next.delete(id));
      else ids.forEach(id => next.add(id));
      return next;
    });
  }

  async function runBulkAction(action: string, reason?: string) {
    if (selected.size === 0) return;
    setBusy(true);
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
      setBusy(false);
    }
  }

  // Group items
  const grouped = (data?.items ?? []).reduce<Record<QueueGroup, QueueItem[]>>(
    (acc, item) => {
      if (!acc[item.queue_group]) acc[item.queue_group] = [];
      acc[item.queue_group].push(item);
      return acc;
    },
    {} as Record<QueueGroup, QueueItem[]>
  );

  const activeGroups = GROUP_ORDER.filter(g => (grouped[g]?.length ?? 0) > 0);

  return (
    <>
      <CutterNav />

      <main className="mx-auto max-w-6xl px-6 py-8 space-y-5 pb-24">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Review Queue</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {data
                ? `${data.total} Clip${data.total !== 1 ? "s" : ""} brauchen Aktion — nach Priorität sortiert`
                : "Lade Queue…"
              }
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

        {/* Summary chips */}
        {data && data.total > 0 && (
          <div className="flex flex-wrap gap-2">
            {GROUP_ORDER.filter(g => data.groupCounts[g] > 0).map(g => {
              const cfg  = GROUP_CONFIG[g];
              const Icon = cfg.icon;
              return (
                <span key={g} className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${cfg.badgeColor}`}>
                  <Icon className="h-3 w-3" />
                  {cfg.label}
                  <span className="font-semibold tabular-nums ml-0.5">{data.groupCounts[g]}</span>
                </span>
              );
            })}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-24 text-muted-foreground/40 gap-2">
            <RefreshCw className="h-4 w-4 animate-spin" />
            <span className="text-sm">Lade Queue…</span>
          </div>
        )}

        {/* Empty state */}
        {!loading && data?.total === 0 && (
          <div className="rounded-xl border border-border bg-card flex flex-col items-center py-20 text-center gap-3">
            <CheckCircle2 className="h-10 w-10 text-emerald-400/40" />
            <p className="text-sm font-medium">Queue ist leer</p>
            <p className="text-xs text-muted-foreground max-w-xs">Kein Clip braucht aktuell eine Aktion. Gut gemacht.</p>
          </div>
        )}

        {/* Groups */}
        {!loading && activeGroups.map(group => (
          <GroupSection
            key={group}
            group={group}
            items={grouped[group] ?? []}
            selected={selected}
            onToggle={toggleItem}
            onSelectAll={toggleAll}
          />
        ))}

      </main>

      {/* Bulk action bar */}
      <BulkBar
        count={selected.size}
        onClear={() => setSelected(new Set())}
        onAction={runBulkAction}
        busy={busy}
      />

      {/* Toast */}
      {toast && (
        <div className={`fixed top-5 right-5 z-50 rounded-lg border px-4 py-3 text-sm font-medium shadow-lg transition-all ${
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
