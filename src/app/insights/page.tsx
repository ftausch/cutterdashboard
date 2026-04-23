"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CutterNav } from "@/components/cutter-nav";
import {
  Plus, RefreshCw, ChevronRight, CheckCircle2, Clock, AlertTriangle,
  XCircle, Upload, FileText, Eye,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────
interface Report {
  id: string | null;
  platform: string | null;
  month: string | null;
  status: string;
  total_views: number | null;
  total_clips: number | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  admin_review_note: string | null;
  created_at: string | null;
  updated_at: string | null;
  proof_count: number;
}

// ── Status config ─────────────────────────────────────────────────────────
const STATUS_CFG: Record<string, { label: string; badge: string; icon: React.ElementType }> = {
  draft:              { label: "Entwurf",           badge: "bg-muted/40 text-muted-foreground border-border",              icon: FileText       },
  submitted:          { label: "Eingereicht",        badge: "bg-blue-500/10 text-blue-400 border-blue-500/20",             icon: Clock          },
  under_review:       { label: "In Prüfung",         badge: "bg-purple-500/10 text-purple-400 border-purple-500/20",       icon: Eye            },
  approved:           { label: "Genehmigt",          badge: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",    icon: CheckCircle2   },
  rejected:           { label: "Abgelehnt",          badge: "bg-red-500/15 text-red-400 border-red-500/25",                icon: XCircle        },
  reupload_requested: { label: "Neu hochladen",      badge: "bg-orange-500/10 text-orange-400 border-orange-500/20",       icon: Upload         },
};

const PLATFORMS = [
  { value: "youtube",   label: "YouTube"   },
  { value: "tiktok",    label: "TikTok"    },
  { value: "instagram", label: "Instagram" },
  { value: "facebook",  label: "Facebook"  },
];

// ── Helpers ───────────────────────────────────────────────────────────────
const fmtNum = new Intl.NumberFormat("de-DE");
function fmtN(n: number | null) {
  if (n === null || n === undefined) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(".", ",")}M`;
  return fmtNum.format(n);
}
function fmtMonth(ym: string | null) {
  if (!ym) return "—";
  const [y, m] = ym.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("de-DE", { month: "long", year: "numeric" });
}
function currentMonth() { return new Date().toISOString().slice(0, 7); }

// ── Create modal ──────────────────────────────────────────────────────────
function CreateModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [platform, setPlatform] = useState("youtube");
  const [month,    setMonth]    = useState(currentMonth());
  const [busy,     setBusy]     = useState(false);
  const [err,      setErr]      = useState("");

  async function submit() {
    setBusy(true); setErr("");
    const res = await fetch("/api/insights", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platform, month }),
    });
    const json = await res.json();
    if (res.ok || res.status === 201) { onCreated(json.id); }
    else { setErr(json.error ?? "Fehler"); setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-semibold text-sm">Monats-Bericht erstellen</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-lg leading-none">×</button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="text-xs text-muted-foreground block mb-1.5">Plattform</label>
            <select
              value={platform}
              onChange={e => setPlatform(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
            >
              {PLATFORMS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1.5">Monat</label>
            <input
              type="month"
              value={month}
              onChange={e => setMonth(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
            />
          </div>
          {err && <p className="text-xs text-red-400">{err}</p>}
        </div>
        <div className="flex gap-2 px-5 py-4 border-t border-border">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Abbrechen
          </button>
          <button
            onClick={submit}
            disabled={busy}
            className="flex-1 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {busy ? "Wird erstellt…" : "Erstellen"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────
export default function InsightsPage() {
  const router = useRouter();

  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/insights");
    if (res.ok) {
      const json = await res.json();
      setReports(json.reports ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function onCreated(id: string) {
    router.push(`/insights/${id}`);
  }

  // Group by month
  const byMonth = new Map<string, Report[]>();
  for (const r of reports) {
    const m = r.month ?? "—";
    if (!byMonth.has(m)) byMonth.set(m, []);
    byMonth.get(m)!.push(r);
  }
  const sortedMonths = [...byMonth.keys()].sort((a, b) => b.localeCompare(a));

  // Pending action needed chips
  const needsAction = reports.filter(r => ["draft", "reupload_requested"].includes(r.status)).length;
  const pendingReview = reports.filter(r => ["submitted", "under_review"].includes(r.status)).length;

  return (
    <div className="min-h-screen bg-background">
      <CutterNav />

      {showCreate && (
        <CreateModal onClose={() => setShowCreate(false)} onCreated={onCreated} />
      )}

      <div className="mx-auto max-w-3xl px-4 sm:px-6 py-6 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Monats-Insights</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Reiche deine monatlichen Plattform-Daten ein.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={load}
              className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <RefreshCw className="h-3 w-3" />
            </button>
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" /> Neu
            </button>
          </div>
        </div>

        {/* Status chips */}
        {(needsAction > 0 || pendingReview > 0) && (
          <div className="flex flex-wrap gap-2">
            {needsAction > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-orange-500/30 bg-orange-500/10 px-3 py-1 text-xs text-orange-400">
                <AlertTriangle className="h-3 w-3" />
                {needsAction} {needsAction === 1 ? "Bericht" : "Berichte"} offen
              </span>
            )}
            {pendingReview > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-xs text-blue-400">
                <Clock className="h-3 w-3" />
                {pendingReview} in Prüfung
              </span>
            )}
          </div>
        )}

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : reports.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="rounded-full bg-muted/30 p-4 mb-4">
              <FileText className="h-8 w-8 text-muted-foreground/40" />
            </div>
            <p className="font-medium mb-1">Noch keine Berichte</p>
            <p className="text-sm text-muted-foreground mb-4">Erstelle deinen ersten Monats-Bericht.</p>
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <Plus className="h-4 w-4" /> Bericht erstellen
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {sortedMonths.map(month => (
              <div key={month}>
                <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/50 mb-3">
                  {fmtMonth(month)}
                </h2>
                <div className="space-y-2">
                  {byMonth.get(month)!.map(report => {
                    const cfg  = STATUS_CFG[report.status] ?? STATUS_CFG.draft;
                    const Icon = cfg.icon;
                    const needsReupload = report.status === "reupload_requested";
                    return (
                      <Link
                        key={report.id}
                        href={`/insights/${report.id}`}
                        className={`flex items-center gap-4 rounded-xl border px-4 py-3.5 transition-colors hover:bg-accent/30 ${
                          needsReupload ? "border-orange-500/30 bg-orange-500/5" : "border-border bg-card"
                        }`}
                      >
                        {/* Platform */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm capitalize">
                              {report.platform === "youtube" ? "YouTube" :
                               report.platform === "tiktok" ? "TikTok" :
                               report.platform === "instagram" ? "Instagram" :
                               report.platform === "facebook" ? "Facebook" : report.platform ?? "—"}
                            </span>
                            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${cfg.badge}`}>
                              <Icon className="h-2.5 w-2.5" />
                              {cfg.label}
                            </span>
                            {report.proof_count > 0 && (
                              <span className="text-[10px] text-muted-foreground/60">
                                {report.proof_count} Screenshot{report.proof_count !== 1 ? "s" : ""}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {report.total_views !== null
                              ? `${fmtN(report.total_views)} Views`
                              : "Keine Views eingetragen"}
                            {report.submitted_at && ` · Eingereicht ${new Date(report.submitted_at).toLocaleDateString("de-DE")}`}
                          </p>
                          {needsReupload && report.admin_review_note && (
                            <p className="mt-1 text-xs text-orange-400">
                              Admin: {report.admin_review_note}
                            </p>
                          )}
                          {report.status === "rejected" && report.admin_review_note && (
                            <p className="mt-1 text-xs text-red-400">
                              Grund: {report.admin_review_note}
                            </p>
                          )}
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground/30 shrink-0" />
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}
