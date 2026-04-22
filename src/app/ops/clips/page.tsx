"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { CutterNav } from "@/components/cutter-nav";
import {
  Flag,
  FlagOff,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Video,
  CheckCircle2,
  AlertTriangle,
  BarChart2,
} from "lucide-react";

interface Clip {
  id: string;
  cutter_id: string;
  platform: string | null;
  external_id: string | null;
  url: string | null;
  title: string | null;
  claimed_views: number | null;
  current_views: number | null;
  observed_views: number | null;
  api_views: number | null;
  verification_status: string | null;
  verification_source: string | null;
  confidence_level: number | null;
  discrepancy_status: string | null;
  discrepancy_percent: number | null;
  is_flagged: number;
  proof_status: string | null;
  last_scraped_at: string | null;
  published_at: string | null;
  created_at: string | null;
  cutter_name: string | null;
  episode_title: string | null;
}

interface Stats {
  total: number;
  verified: number;
  suspicious_critical: number;
  avg_confidence: number | null;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface ClipsResponse {
  clips: Clip[];
  stats: Stats;
  pagination: Pagination;
}

interface CutterOption {
  id: string;
  name: string;
}

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  verified: { label: "✓ Verifiziert", cls: "bg-emerald-500/10 text-emerald-400" },
  partially_verified: { label: "~ Teilweise", cls: "bg-yellow-500/10 text-yellow-400" },
  unverified: { label: "Ausstehend", cls: "bg-muted/50 text-muted-foreground" },
  claimed_only: { label: "Nur Angabe", cls: "bg-orange-500/10 text-orange-400" },
  manual_proof: { label: "Beleg", cls: "bg-blue-500/10 text-blue-400" },
  unavailable: { label: "—", cls: "bg-muted/50 text-muted-foreground" },
};

const PLATFORM_LABELS: Record<string, string> = {
  youtube: "YouTube",
  tiktok: "TikTok",
  instagram: "Instagram",
  facebook: "Facebook",
};

const DISC_LABELS: Record<string, { label: string; cls: string }> = {
  match: { label: "Übereinstimmung", cls: "text-emerald-400" },
  minor_difference: { label: "Geringe Diff.", cls: "text-yellow-400" },
  suspicious_difference: { label: "Verdächtig", cls: "text-orange-400" },
  critical_difference: { label: "Kritisch", cls: "text-red-400" },
  no_data: { label: "Keine Daten", cls: "text-muted-foreground" },
};

function formatNum(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  return new Intl.NumberFormat("de-DE").format(n);
}

function formatRelative(dateStr: string | null): string {
  if (!dateStr) return "—";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `vor ${mins}min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `vor ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "gestern";
  return `vor ${days} Tagen`;
}

function SkeletonRow() {
  return (
    <tr className="border-b border-border">
      {Array.from({ length: 11 }).map((_, i) => (
        <td key={i} className="px-3 py-3">
          <div className="skeleton h-4 w-full" />
        </td>
      ))}
    </tr>
  );
}

export default function ClipsPage() {
  return (
    <Suspense>
      <ClipsPageInner />
    </Suspense>
  );
}

function ClipsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [data, setData] = useState<ClipsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [cutters, setCutters] = useState<CutterOption[]>([]);
  const [flagging, setFlagging] = useState<string | null>(null);

  // Filter state from URL
  const [cutter, setCutter] = useState(searchParams.get("cutter") ?? "");
  const [platform, setPlatform] = useState(searchParams.get("platform") ?? "");
  const [status, setStatus] = useState(searchParams.get("status") ?? "");
  const [discrepancy, setDiscrepancy] = useState(searchParams.get("discrepancy") ?? "");
  const page = parseInt(searchParams.get("page") ?? "1", 10);

  function buildQuery(overrides: Record<string, string> = {}) {
    const p = new URLSearchParams();
    const vals: Record<string, string> = { cutter, platform, status, discrepancy, ...overrides };
    Object.entries(vals).forEach(([k, v]) => { if (v) p.set(k, v); });
    if (!overrides.page) p.set("page", "1");
    return p.toString();
  }

  function applyFilters() {
    router.push(`/ops/clips?${buildQuery()}`);
  }

  function goPage(p: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(p));
    router.push(`/ops/clips?${params.toString()}`);
  }

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams(searchParams.toString());
    const res = await fetch(`/api/ops/clips?${params.toString()}`);
    if (res.status === 401) { router.push("/login"); return; }
    if (res.status === 403) { router.push("/dashboard"); return; }
    const json = await res.json();
    setData(json);
    setLoading(false);
  }, [searchParams, router]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    fetch("/api/admin/cutters")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.cutters) setCutters(d.cutters); });
  }, []);

  async function toggleFlag(clip: Clip) {
    setFlagging(clip.id);
    const action = clip.is_flagged ? "unflag" : "flag";
    await fetch(`/api/ops/clips/${clip.id}/actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    await load();
    setFlagging(null);
  }

  const selectCls = "h-9 rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-primary";

  return (
    <>
      <CutterNav />
      <main className="mx-auto max-w-7xl px-6 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Clips</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Alle Clips mit Verifikationsstatus
            </p>
          </div>
          <button
            onClick={load}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm hover:bg-accent"
          >
            <RefreshCw className="h-4 w-4" />
            Aktualisieren
          </button>
        </div>

        {/* Filter bar */}
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Cutter</label>
            <select
              value={cutter}
              onChange={e => setCutter(e.target.value)}
              className={selectCls}
            >
              <option value="">Alle Cutter</option>
              {cutters.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Plattform</label>
            <select value={platform} onChange={e => setPlatform(e.target.value)} className={selectCls}>
              <option value="">Alle</option>
              <option value="youtube">YouTube</option>
              <option value="tiktok">TikTok</option>
              <option value="instagram">Instagram</option>
              <option value="facebook">Facebook</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Status</label>
            <select value={status} onChange={e => setStatus(e.target.value)} className={selectCls}>
              <option value="">Alle Status</option>
              <option value="verified">Verifiziert</option>
              <option value="partially_verified">Teilweise</option>
              <option value="unverified">Ausstehend</option>
              <option value="claimed_only">Nur Angabe</option>
              <option value="manual_proof">Beleg</option>
              <option value="unavailable">Nicht verfügbar</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Diskrepanz</label>
            <select value={discrepancy} onChange={e => setDiscrepancy(e.target.value)} className={selectCls}>
              <option value="">Alle</option>
              <option value="match">Übereinstimmung</option>
              <option value="minor_difference">Geringe Diff.</option>
              <option value="suspicious_difference">Verdächtig</option>
              <option value="critical_difference">Kritisch</option>
              <option value="no_data">Keine Daten</option>
            </select>
          </div>
          <button
            onClick={applyFilters}
            className="h-9 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Filtern
          </button>
          {(cutter || platform || status || discrepancy) && (
            <button
              onClick={() => {
                setCutter(""); setPlatform(""); setStatus(""); setDiscrepancy("");
                router.push("/ops/clips");
              }}
              className="h-9 rounded-lg border border-border px-3 text-sm text-muted-foreground hover:bg-accent"
            >
              Zurücksetzen
            </button>
          )}
        </div>

        {/* Stats row */}
        {loading ? (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-border bg-card p-4 space-y-2">
                <div className="skeleton h-4 w-16" />
                <div className="skeleton h-7 w-12" />
                <div className="skeleton h-3 w-24" />
              </div>
            ))}
          </div>
        ) : data && (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard icon={<Video className="h-4 w-4" />} label="Clips gesamt" value={String(data.stats.total)} />
            <StatCard icon={<CheckCircle2 className="h-4 w-4 text-emerald-400" />} label="Verifiziert" value={String(data.stats.verified)} accent="emerald" />
            <StatCard icon={<AlertTriangle className="h-4 w-4 text-orange-400" />} label="Verdächtig / Kritisch" value={String(data.stats.suspicious_critical)} accent="orange" />
            <StatCard icon={<BarChart2 className="h-4 w-4 text-blue-400" />} label="Ø Konfidenz" value={data.stats.avg_confidence != null ? `${data.stats.avg_confidence}/100` : "—"} accent="blue" />
          </div>
        )}

        {/* Table */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Cutter</th>
                  <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Episode</th>
                  <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Plattform</th>
                  <th className="px-3 py-2.5 text-left font-medium text-muted-foreground max-w-48">Clip</th>
                  <th className="px-3 py-2.5 text-right font-medium text-muted-foreground">Angabe</th>
                  <th className="px-3 py-2.5 text-right font-medium text-muted-foreground">Verifiziert</th>
                  <th className="px-3 py-2.5 text-right font-medium text-muted-foreground">Disc.%</th>
                  <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Quelle</th>
                  <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Status</th>
                  <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Letzter Sync</th>
                  <th className="px-3 py-2.5 text-center font-medium text-muted-foreground">Aktionen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading ? (
                  Array.from({ length: 10 }).map((_, i) => <SkeletonRow key={i} />)
                ) : !data || data.clips.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-4 py-16 text-center text-muted-foreground">
                      <Video className="h-8 w-8 mx-auto mb-3 opacity-30" />
                      <p className="font-medium">Keine Clips gefunden</p>
                      <p className="text-xs mt-1">Versuche die Filter anzupassen oder zurückzusetzen.</p>
                    </td>
                  </tr>
                ) : (
                  data.clips.map((clip) => {
                    const isCritical = clip.discrepancy_status === "critical_difference";
                    const isSuspicious = clip.discrepancy_status === "suspicious_difference";
                    const rowCls = isCritical
                      ? "border-l-2 border-red-500 hover:bg-muted/30"
                      : isSuspicious
                      ? "border-l-2 border-amber-500 hover:bg-muted/30"
                      : "hover:bg-muted/30";
                    const statusCfg = STATUS_CONFIG[clip.verification_status ?? ""] ?? STATUS_CONFIG.unavailable;
                    const discCfg = DISC_LABELS[clip.discrepancy_status ?? ""] ?? DISC_LABELS.no_data;

                    return (
                      <tr key={clip.id} className={rowCls}>
                        <td className="px-3 py-3">
                          <Link
                            href={`/ops/clips?cutter=${clip.cutter_id}`}
                            className="font-medium hover:text-primary text-xs"
                            onClick={e => {
                              e.preventDefault();
                              setCutter(clip.cutter_id);
                              router.push(`/ops/clips?cutter=${clip.cutter_id}`);
                            }}
                          >
                            {clip.cutter_name ?? "—"}
                          </Link>
                        </td>
                        <td className="px-3 py-3 text-xs text-muted-foreground max-w-32 truncate">
                          {clip.episode_title ?? "—"}
                        </td>
                        <td className="px-3 py-3">
                          <span className="rounded bg-muted px-1.5 py-0.5 text-xs">
                            {PLATFORM_LABELS[clip.platform ?? ""] ?? clip.platform ?? "—"}
                          </span>
                        </td>
                        <td className="px-3 py-3 max-w-48">
                          {clip.url ? (
                            <a
                              href={clip.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block truncate text-xs hover:text-primary"
                              title={clip.title ?? ""}
                            >
                              {clip.title ?? clip.url}
                            </a>
                          ) : (
                            <span className="text-xs text-muted-foreground truncate block" title={clip.title ?? ""}>
                              {clip.title ?? "—"}
                            </span>
                          )}
                          {clip.is_flagged ? (
                            <span className="text-xs text-red-400 flex items-center gap-0.5 mt-0.5">
                              <Flag className="h-3 w-3" /> Geflaggt
                            </span>
                          ) : null}
                        </td>
                        <td className="px-3 py-3 text-right text-xs font-mono">
                          {formatNum(clip.claimed_views)}
                        </td>
                        <td className="px-3 py-3 text-right text-xs font-mono">
                          {formatNum(clip.api_views ?? clip.observed_views ?? clip.current_views)}
                        </td>
                        <td className="px-3 py-3 text-right text-xs">
                          {clip.discrepancy_percent != null ? (
                            <span className={discCfg.cls}>
                              {clip.discrepancy_percent > 0 ? "+" : ""}
                              {clip.discrepancy_percent.toFixed(1)}%
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-xs text-muted-foreground">
                          {clip.verification_source ?? "—"}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex flex-col gap-1">
                            <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${statusCfg.cls}`}>
                              {statusCfg.label}
                            </span>
                            {clip.confidence_level != null && (
                              <span className="text-xs text-muted-foreground">
                                {clip.confidence_level}/100
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-xs text-muted-foreground whitespace-nowrap">
                          {formatRelative(clip.last_scraped_at)}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-1.5 justify-center">
                            <Link
                              href={`/ops/clips/${clip.id}`}
                              className="rounded bg-muted px-2 py-1 text-xs hover:bg-accent transition-colors whitespace-nowrap"
                            >
                              Detail
                            </Link>
                            <button
                              onClick={() => toggleFlag(clip)}
                              disabled={flagging === clip.id}
                              title={clip.is_flagged ? "Entflaggen" : "Flaggen"}
                              className={`rounded p-1 transition-colors disabled:opacity-50 ${
                                clip.is_flagged
                                  ? "bg-red-500/10 text-red-400 hover:bg-red-500/20"
                                  : "bg-muted text-muted-foreground hover:bg-accent"
                              }`}
                            >
                              {clip.is_flagged ? (
                                <FlagOff className="h-3.5 w-3.5" />
                              ) : (
                                <Flag className="h-3.5 w-3.5" />
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {data && data.pagination.totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-border px-4 py-3">
              <p className="text-xs text-muted-foreground">
                {data.pagination.total} Clips · Seite {data.pagination.page} von {data.pagination.totalPages}
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => goPage(page - 1)}
                  disabled={page <= 1}
                  className="rounded p-1.5 text-muted-foreground hover:bg-accent disabled:opacity-40"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  onClick={() => goPage(page + 1)}
                  disabled={page >= data.pagination.totalPages}
                  className="rounded p-1.5 text-muted-foreground hover:bg-accent disabled:opacity-40"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </>
  );
}

function StatCard({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent?: "emerald" | "orange" | "blue";
}) {
  const borderColor =
    accent === "emerald" ? "border-emerald-500/20" :
    accent === "orange" ? "border-orange-500/20" :
    accent === "blue" ? "border-blue-500/20" :
    "border-border";

  return (
    <div className={`rounded-xl border ${borderColor} bg-card p-4`}>
      <div className="mb-2 text-muted-foreground">{icon}</div>
      <p className="text-2xl font-bold">{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
