"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CutterNav } from "@/components/cutter-nav";
import { Save, CheckCircle, UserPlus, Activity, RefreshCw, Youtube, Clock, AlertCircle, CheckCircle2 } from "lucide-react";

interface Cutter {
  id: string;
  name: string;
  email: string;
  rate_per_view: number;
  is_active: number;
  is_admin: number;
  role: "super_admin" | "ops_manager" | "cutter" | "viewer";
  video_count: number;
  total_invoiced: number;
  total_views: number;
  created_at: string;
}

interface Settings {
  recipient_company_name?: string;
  recipient_company_address?: string;
  recipient_tax_id?: string;
}

interface ScrapeStatus {
  lastScrapedAt: string | null;
  total24h: number;
  succeeded24h: number;
  failed24h: number;
  successRate24h: number | null;
  failuresByPlatform: Array<{ platform: string; count: number }>;
  recentFailures: Array<{
    scraped_at: string;
    error_message: string;
    platform: string;
    url: string;
    title: string | null;
  }>;
}

interface SyncLog {
  status: string;
  result: {
    accounts?: number;
    totalCreated?: number;
    totalUpdated?: number;
    totalVideosFound?: number;
    errors?: Array<{ cutter: string; platform: string; error: string }>;
  } | null;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
}

function formatEur(n: number): string {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);
}

function formatNum(n: number): string {
  return new Intl.NumberFormat("de-DE").format(n);
}

export default function CutterAdminPage() {
  const router = useRouter();
  const [cutters, setCutters] = useState<Cutter[]>([]);
  const [settings, setSettings] = useState<Settings>({});
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newRate, setNewRate] = useState("0.01");
  const [scrapeStatus, setScrapeStatus] = useState<ScrapeStatus | null>(null);
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([]);
  const [syncing, setSyncing] = useState(false);

  function loadSyncLogs() {
    fetch("/api/admin/sync")
      .then((r) => r.json())
      .then((data) => data?.logs && setSyncLogs(data.logs))
      .catch(() => {});
  }

  async function handleManualSync() {
    setSyncing(true);
    try {
      const res = await fetch("/api/admin/sync", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        loadAll();
        loadSyncLogs();
      } else {
        alert("Sync-Fehler: " + data.error);
      }
    } finally {
      setSyncing(false);
    }
  }

  function loadAll() {
    fetch("/api/admin/cutters")
      .then((r) => {
        if (r.status === 401 || r.status === 403) { router.push("/login"); return null; }
        return r.json();
      })
      .then((data) => data?.cutters && setCutters(data.cutters));

    fetch("/api/admin/settings")
      .then((r) => r.json())
      .then((data) => data?.settings && setSettings(data.settings));

    fetch("/api/admin/scrape-status")
      .then((r) => r.json())
      .then((data) => data?.lastScrapedAt !== undefined && setScrapeStatus(data))
      .catch(() => {});
  }

  useEffect(() => { loadAll(); loadSyncLogs(); }, [router]);

  async function handleCreateCutter() {
    if (!newName.trim() || !newEmail.trim()) return;

    const res = await fetch("/api/admin/cutters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newName.trim(),
        email: newEmail.trim(),
        rate_per_view: parseFloat(newRate) || 0.01,
      }),
    });

    if (res.ok) {
      setShowNew(false);
      setNewName("");
      setNewEmail("");
      setNewRate("0.01");
      loadAll();
    } else {
      const data = await res.json();
      alert(data.error || "Fehler");
    }
  }

  async function handleUpdateCutter(id: string, field: string, value: number | string) {
    await fetch("/api/admin/cutters", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, [field]: value }),
    });
    loadAll();
  }

  async function handleSaveSettings() {
    for (const [key, value] of Object.entries(settings)) {
      await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value }),
      });
    }
    setSettingsSaved(true);
    setTimeout(() => setSettingsSaved(false), 3000);
  }

  return (
    <>
      <CutterNav />
      <main className="mx-auto max-w-5xl p-6">
        <h1 className="mb-6 text-2xl font-bold">Admin</h1>

        {/* Cutter Management */}
        <section className="mb-8">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Cutter-Verwaltung</h2>
            <button
              onClick={() => setShowNew(!showNew)}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              <UserPlus className="h-4 w-4" />
              Neuer Cutter
            </button>
          </div>

          {showNew && (
            <div className="mb-4 rounded-xl border border-primary/30 bg-primary/5 p-4">
              <div className="grid gap-3 sm:grid-cols-4">
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Name"
                  className="h-9 rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-primary"
                />
                <input
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="E-Mail"
                  type="email"
                  className="h-9 rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-primary"
                />
                <input
                  value={newRate}
                  onChange={(e) => setNewRate(e.target.value)}
                  placeholder="Rate/View"
                  type="number"
                  step="0.001"
                  className="h-9 rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-primary"
                />
                <button
                  onClick={handleCreateCutter}
                  className="h-9 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground"
                >
                  Anlegen
                </button>
              </div>
            </div>
          )}

          <div className="rounded-xl border border-border bg-card">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Name</th>
                    <th className="px-4 py-3 font-medium">E-Mail</th>
                    <th className="px-4 py-3 font-medium">Rolle</th>
                    <th className="px-4 py-3 font-medium text-right">Rate/View</th>
                    <th className="px-4 py-3 font-medium text-right">Videos</th>
                    <th className="px-4 py-3 font-medium text-right">Views</th>
                    <th className="px-4 py-3 font-medium text-right">Abgerechnet</th>
                    <th className="px-4 py-3 font-medium text-center">Aktiv</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {cutters.map((c) => (
                    <tr key={c.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium">{c.name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{c.email}</td>
                      <td className="px-4 py-3">
                        <select
                          value={c.role ?? "cutter"}
                          onChange={(e) => handleUpdateCutter(c.id, "role", e.target.value)}
                          className="h-7 rounded border border-input bg-background px-1.5 text-xs outline-none focus:border-primary"
                        >
                          <option value="super_admin">Admin</option>
                          <option value="ops_manager">Ops Manager</option>
                          <option value="cutter">Cutter</option>
                          <option value="viewer">Viewer</option>
                        </select>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <input
                          type="number"
                          step="0.001"
                          defaultValue={c.rate_per_view}
                          onBlur={(e) => {
                            const val = parseFloat(e.target.value);
                            if (!isNaN(val) && val !== c.rate_per_view) {
                              handleUpdateCutter(c.id, "rate_per_view", val);
                            }
                          }}
                          className="h-7 w-20 rounded border border-input bg-background px-2 text-right text-sm outline-none focus:border-primary"
                        />
                      </td>
                      <td className="px-4 py-3 text-right">{c.video_count}</td>
                      <td className="px-4 py-3 text-right">{formatNum(c.total_views)}</td>
                      <td className="px-4 py-3 text-right">{formatEur(c.total_invoiced)}</td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => handleUpdateCutter(c.id, "is_active", c.is_active ? 0 : 1)}
                          className={`rounded px-2 py-0.5 text-xs font-medium ${
                            c.is_active
                              ? "bg-emerald-500/10 text-emerald-400"
                              : "bg-red-500/10 text-red-400"
                          }`}
                        >
                          {c.is_active ? "Aktiv" : "Inaktiv"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Scrape Status */}
        {scrapeStatus && (
          <section className="mb-8">
            <h2 className="mb-4 text-lg font-semibold flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Scrape-Status
            </h2>
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="grid gap-4 sm:grid-cols-4 mb-4">
                <div>
                  <p className="text-xs text-muted-foreground">Letzter Scrape</p>
                  <p className="text-sm font-medium">
                    {scrapeStatus.lastScrapedAt
                      ? new Date(scrapeStatus.lastScrapedAt + "Z").toLocaleString("de-DE")
                      : "Noch nie"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Erfolgsrate (24h)</p>
                  <p className={`text-sm font-medium ${
                    scrapeStatus.successRate24h !== null && scrapeStatus.successRate24h < 80
                      ? "text-red-400"
                      : "text-emerald-400"
                  }`}>
                    {scrapeStatus.successRate24h !== null ? `${scrapeStatus.successRate24h}%` : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Erfolgreich (24h)</p>
                  <p className="text-sm font-medium text-emerald-400">{formatNum(scrapeStatus.succeeded24h)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Fehlgeschlagen (24h)</p>
                  <p className={`text-sm font-medium ${scrapeStatus.failed24h > 0 ? "text-red-400" : ""}`}>
                    {formatNum(scrapeStatus.failed24h)}
                  </p>
                </div>
              </div>

              {scrapeStatus.failuresByPlatform.length > 0 && (
                <div className="mb-4">
                  <p className="mb-2 text-xs font-medium text-muted-foreground">Fehler nach Plattform (24h)</p>
                  <div className="flex gap-2">
                    {scrapeStatus.failuresByPlatform.map((f) => (
                      <span
                        key={f.platform}
                        className="rounded-md bg-red-500/10 px-2 py-1 text-xs font-medium text-red-400"
                      >
                        {f.platform}: {f.count}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {scrapeStatus.recentFailures.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-medium text-muted-foreground">Letzte Fehler</p>
                  <div className="max-h-48 overflow-y-auto rounded-lg border border-border">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border text-left text-muted-foreground">
                          <th className="px-3 py-2 font-medium">Zeit</th>
                          <th className="px-3 py-2 font-medium">Plattform</th>
                          <th className="px-3 py-2 font-medium">Video</th>
                          <th className="px-3 py-2 font-medium">Fehler</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {scrapeStatus.recentFailures.map((f, i) => (
                          <tr key={i} className="hover:bg-muted/30">
                            <td className="px-3 py-2 whitespace-nowrap">
                              {new Date(f.scraped_at + "Z").toLocaleString("de-DE", {
                                day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit"
                              })}
                            </td>
                            <td className="px-3 py-2">{f.platform}</td>
                            <td className="px-3 py-2 max-w-[200px] truncate" title={f.url}>
                              {f.title || f.url}
                            </td>
                            <td className="px-3 py-2 max-w-[250px] truncate text-red-400" title={f.error_message}>
                              {f.error_message}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Auto-Sync Panel */}
        <section className="mb-8">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-primary" />
              Auto-Sync
            </h2>
            <button
              onClick={handleManualSync}
              disabled={syncing}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "Sync läuft..." : "Jetzt synchronisieren"}
            </button>
          </div>

          <div className="rounded-xl border border-border bg-card p-5 mb-3">
            <div className="flex items-start gap-3 mb-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 shrink-0">
                <Clock className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium">Täglich 04:00 Uhr (automatisch)</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Läuft auf Vercel — auch wenn dein Laptop geschlossen ist. Zieht Views von allen verbundenen Klipper-Accounts.
                </p>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <p className="text-xs font-medium text-muted-foreground mb-2">Plattform-Status</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="flex items-center gap-2 text-sm">
                  <Youtube className="h-4 w-4 text-red-400" />
                  <span>YouTube</span>
                  <span className="ml-auto text-xs rounded-full bg-emerald-500/15 text-emerald-400 px-2 py-0.5 font-medium">Bereit</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="h-4 w-4 text-[#ff0050] font-bold text-xs flex items-center justify-center">TK</span>
                  <span>TikTok</span>
                  <span className="ml-auto text-xs rounded-full bg-amber-500/15 text-amber-400 px-2 py-0.5 font-medium">Business API nötig</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="h-4 w-4 text-pink-400 font-bold text-xs flex items-center justify-center">IG</span>
                  <span>Instagram</span>
                  <span className="ml-auto text-xs rounded-full bg-amber-500/15 text-amber-400 px-2 py-0.5 font-medium">OAuth nötig</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="h-4 w-4 text-blue-400 font-bold text-xs flex items-center justify-center">FB</span>
                  <span>Facebook</span>
                  <span className="ml-auto text-xs rounded-full bg-muted text-muted-foreground px-2 py-0.5 font-medium">Coming soon</span>
                </div>
              </div>
            </div>
          </div>

          {/* Sync History */}
          {syncLogs.length > 0 && (
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="px-4 py-3 border-b border-border">
                <p className="text-sm font-medium">Sync-Verlauf</p>
              </div>
              <div className="divide-y divide-border">
                {syncLogs.map((log, i) => (
                  <div key={i} className="px-4 py-3 flex items-start gap-3">
                    <div className="mt-0.5 shrink-0">
                      {log.status === "done" ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                      ) : log.status === "running" ? (
                        <RefreshCw className="h-4 w-4 text-primary animate-spin" />
                      ) : (
                        <AlertCircle className="h-4 w-4 text-red-400" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">
                          {log.status === "done" ? "Sync abgeschlossen" : log.status === "running" ? "Sync läuft..." : "Fehler"}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(log.startedAt + "Z").toLocaleString("de-DE", {
                            day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit"
                          })}
                        </span>
                        {log.durationMs && (
                          <span className="text-xs text-muted-foreground ml-auto">
                            {(log.durationMs / 1000).toFixed(1)}s
                          </span>
                        )}
                      </div>
                      {log.result && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {log.result.accounts ?? 0} Accounts · {log.result.totalVideosFound ?? 0} Videos gefunden · {log.result.totalCreated ?? 0} neu · {log.result.totalUpdated ?? 0} aktualisiert
                          {(log.result.errors?.length ?? 0) > 0 && (
                            <span className="text-amber-400 ml-1">· {log.result.errors?.length} Fehler</span>
                          )}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Recipient Settings */}
        <section>
          <h2 className="mb-4 text-lg font-semibold">Rechnungsempfänger</h2>
          <div className="rounded-xl border border-border bg-card p-5">
            <p className="mb-4 text-xs text-muted-foreground">
              Diese Daten erscheinen als Empfänger auf allen Cutter-Rechnungen.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium">Firmenname</label>
                <input
                  value={settings.recipient_company_name || ""}
                  onChange={(e) => setSettings({ ...settings, recipient_company_name: e.target.value })}
                  className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">USt-IdNr.</label>
                <input
                  value={settings.recipient_tax_id || ""}
                  onChange={(e) => setSettings({ ...settings, recipient_tax_id: e.target.value })}
                  className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-primary"
                />
              </div>
            </div>
            <div className="mt-4">
              <label className="mb-1 block text-sm font-medium">Adresse</label>
              <input
                value={settings.recipient_company_address || ""}
                onChange={(e) => setSettings({ ...settings, recipient_company_address: e.target.value })}
                className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-primary"
              />
            </div>
            <button
              onClick={handleSaveSettings}
              className="mt-4 flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              {settingsSaved ? (
                <>
                  <CheckCircle className="h-4 w-4" />
                  Gespeichert
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  Speichern
                </>
              )}
            </button>
          </div>
        </section>
      </main>
    </>
  );
}
