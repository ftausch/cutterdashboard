"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CutterNav } from "@/components/cutter-nav";
import {
  PLATFORM_ORDER, PLATFORM_DEFS, type Platform,
} from "@/lib/platforms";
import {
  CheckCircle2, AlertTriangle, Trash2, ExternalLink,
  RefreshCw, Plus, Wifi, WifiOff, Link2,
} from "lucide-react";

interface ConnectedAccount {
  id: string;
  platform: Platform;
  account_handle: string | null;
  connection_status: string;
  connection_type: "oauth" | "manual";
  views_accessible: boolean;
  sync_error: string | null;
  last_synced_at: string | null;
}

type OAuthConfigured = Record<Platform, boolean>;

// ── Toast ──────────────────────────────────────────────────────
function Toast({ message, type, onDismiss }: {
  message: string; type: "success" | "error" | "warning"; onDismiss: () => void;
}) {
  const cls = {
    success: "bg-emerald-600/90 border-emerald-500/50",
    error:   "bg-red-600/90 border-red-500/50",
    warning: "bg-yellow-600/90 border-yellow-500/50",
  }[type];
  return (
    <div
      onClick={onDismiss}
      className={`fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium text-white shadow-xl cursor-pointer backdrop-blur-sm ${cls}`}
    >
      {type === "success" ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
      {message}
    </div>
  );
}

// ── Platform Card ──────────────────────────────────────────────
function PlatformCard({
  platform, account, oauthReady, disconnecting,
  onConnect, onManual, onDisconnect, onReconnect,
}: {
  platform: Platform;
  account: ConnectedAccount | null;
  oauthReady: boolean;
  disconnecting: boolean;
  onConnect: () => void;
  onManual: (h: string) => void;
  onDisconnect: () => void;
  onReconnect: () => void;
}) {
  const def = PLATFORM_DEFS[platform];
  const [handleInput, setHandleInput] = useState("");
  const [showInput, setShowInput] = useState(false);

  const isConnected = account?.connection_status === "connected" || account?.connection_status === "connected_limited";
  const isManual    = account?.connection_status === "manual";
  const isExpired   = account?.connection_status === "token_expired";
  const isError     = account?.connection_status === "error";
  const isLinked    = isConnected || isManual || isExpired || isError;

  return (
    <div className={`rounded-2xl border bg-card overflow-hidden transition-all ${
      isConnected ? "border-emerald-500/30" :
      isManual    ? "border-yellow-500/20" :
      isExpired || isError ? "border-orange-500/25" :
      "border-border/60"
    }`}>
      {/* ── Header row ── */}
      <div className="flex items-center gap-3 px-5 py-4">
        {/* Icon */}
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-lg border ${def.color_text} ${def.color_bg} ${def.color_border}`}>
          {def.emoji}
        </div>

        {/* Name + handle */}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm">{def.label}</p>
          {account?.account_handle ? (
            <p className="text-xs text-muted-foreground truncate">@{account.account_handle}</p>
          ) : (
            <p className="text-xs text-muted-foreground/50">Nicht verbunden</p>
          )}
        </div>

        {/* Status pill */}
        {isConnected && (
          <span className="flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-400">
            <Wifi className="h-3 w-3" /> Verbunden
          </span>
        )}
        {isManual && (
          <span className="flex items-center gap-1.5 rounded-full border border-yellow-500/30 bg-yellow-500/10 px-2.5 py-1 text-xs font-medium text-yellow-400">
            <Link2 className="h-3 w-3" /> Manuell
          </span>
        )}
        {(isExpired || isError) && (
          <span className="flex items-center gap-1.5 rounded-full border border-orange-500/30 bg-orange-500/10 px-2.5 py-1 text-xs font-medium text-orange-400">
            <WifiOff className="h-3 w-3" /> Problem
          </span>
        )}
        {!isLinked && (
          <span className="flex items-center gap-1.5 rounded-full border border-border/50 bg-muted/20 px-2.5 py-1 text-xs font-medium text-muted-foreground/60">
            <WifiOff className="h-3 w-3" /> Nicht verbunden
          </span>
        )}
      </div>

      {/* ── Warnings ── */}
      {isExpired && (
        <div className="mx-5 mb-3 flex items-center gap-2 rounded-lg border border-orange-500/30 bg-orange-500/10 px-3 py-2 text-xs text-orange-400">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          Token abgelaufen — bitte neu verbinden.
        </div>
      )}
      {isError && account?.sync_error && (
        <div className="mx-5 mb-3 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {account.sync_error}
        </div>
      )}
      {def.limitation_note && !isLinked && (
        <div className="mx-5 mb-3 flex items-start gap-2 text-xs text-muted-foreground/60">
          <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0 text-yellow-500/50" />
          {def.limitation_note}
        </div>
      )}

      {/* ── Handle input (inline) ── */}
      {showInput && (
        <div className="mx-5 mb-4 flex items-center gap-2">
          <input
            autoFocus
            value={handleInput}
            onChange={(e) => setHandleInput(e.target.value)}
            placeholder={def.placeholder}
            className="h-9 flex-1 rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-primary"
            onKeyDown={(e) => {
              if (e.key === "Enter" && handleInput.trim()) {
                onManual(handleInput.trim());
                setHandleInput("");
                setShowInput(false);
              }
              if (e.key === "Escape") setShowInput(false);
            }}
          />
          <button
            onClick={() => { if (handleInput.trim()) { onManual(handleInput.trim()); setHandleInput(""); setShowInput(false); } }}
            disabled={!handleInput.trim()}
            className="h-9 rounded-xl bg-primary px-3 text-xs font-medium text-primary-foreground disabled:opacity-40"
          >
            Speichern
          </button>
          <button
            onClick={() => setShowInput(false)}
            className="h-9 rounded-xl border border-border px-3 text-xs text-muted-foreground hover:text-foreground"
          >
            ✕
          </button>
        </div>
      )}

      {/* ── Action buttons ── */}
      {!showInput && (
        <div className="flex items-center gap-2 px-5 pb-4 flex-wrap">
          {/* Not linked → connect or manual */}
          {!isLinked && (
            oauthReady ? (
              <button
                onClick={onConnect}
                className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
              >
                <Plus className="h-4 w-4" />
                {def.connect_label}
              </button>
            ) : (
              <button
                onClick={() => setShowInput(true)}
                className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                <Plus className="h-4 w-4" />
                Handle eintragen
              </button>
            )
          )}

          {/* Manual → upgrade to OAuth if available */}
          {isManual && oauthReady && (
            <button
              onClick={onConnect}
              className="flex items-center gap-1.5 rounded-xl bg-primary/15 border border-primary/30 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/25 transition-colors"
            >
              <RefreshCw className="h-4 w-4" />
              Per OAuth verbinden
            </button>
          )}

          {/* Expired / error → reconnect */}
          {(isExpired || isError) && (
            <button
              onClick={onReconnect}
              className="flex items-center gap-1.5 rounded-xl bg-orange-500/15 border border-orange-500/30 px-4 py-2 text-sm font-medium text-orange-400 hover:bg-orange-500/25 transition-colors"
            >
              <RefreshCw className="h-4 w-4" />
              Neu verbinden
            </button>
          )}

          {/* Profile link */}
          {account?.account_handle && (
            <a
              href={`${def.url_prefix}${account.account_handle}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <ExternalLink className="h-4 w-4" />
              Profil
            </a>
          )}

          {/* DELETE — prominent, always visible if linked */}
          {isLinked && (
            <button
              onClick={onDisconnect}
              disabled={disconnecting}
              className="ml-auto flex items-center gap-1.5 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-400 hover:bg-red-500/20 hover:border-red-500/50 transition-colors disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
              Löschen
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────
function AccountsPageInner() {
  const router       = useRouter();
  const searchParams = useSearchParams();

  const [accounts,        setAccounts]        = useState<ConnectedAccount[]>([]);
  const [oauthConfigured, setOauthConfigured] = useState<OAuthConfigured>({
    youtube: false, instagram: false, facebook: false, tiktok: false,
  });
  const [toast,           setToast]           = useState<{ message: string; type: "success" | "error" | "warning" } | null>(null);
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);

  function showToast(message: string, type: "success" | "error" | "warning") {
    setToast({ message, type });
    setTimeout(() => setToast(null), 5000);
  }

  useEffect(() => {
    const success = searchParams.get("success");
    const error   = searchParams.get("error");
    const MSGS: Record<string, [string, "success" | "error" | "warning"]> = {
      youtube_connected:      ["YouTube erfolgreich verbunden.", "success"],
      instagram_connected:    ["Instagram erfolgreich verbunden.", "success"],
      youtube_denied:         ["YouTube-Verbindung abgebrochen.", "warning"],
      instagram_denied:       ["Instagram-Verbindung abgelehnt.", "warning"],
      invalid_state:          ["Sicherheitsfehler. Bitte erneut versuchen.", "error"],
      youtube_failed:         ["YouTube-Verbindung fehlgeschlagen.", "error"],
      youtube_not_configured: ["YouTube OAuth ist noch nicht konfiguriert.", "warning"],
      youtube_no_channel:     ["Kein YouTube-Kanal gefunden.", "error"],
      instagram_failed:       ["Instagram-Verbindung fehlgeschlagen.", "error"],
    };
    const key = success ?? error ?? null;
    if (key && MSGS[key]) { showToast(...MSGS[key]); router.replace("/accounts"); }
  }, [searchParams, router]);

  function loadAccounts() {
    fetch("/api/accounts")
      .then((r) => { if (r.status === 401) { router.push("/login"); return null; } return r.json(); })
      .then((data) => {
        if (!data) return;
        setAccounts(data.accounts ?? []);
        if (data.oauth_configured) setOauthConfigured(data.oauth_configured);
      });
  }

  useEffect(() => { loadAccounts(); }, []);

  async function handleManual(platform: Platform, handle: string) {
    const res = await fetch("/api/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platform, account_handle: handle }),
    });
    if (res.ok) { showToast("Handle gespeichert.", "success"); loadAccounts(); }
    else { const d = await res.json(); showToast(d.error || "Fehler beim Speichern.", "error"); }
  }

  async function handleDisconnect(id: string) {
    if (!confirm("Verbindung wirklich löschen?")) return;
    setDisconnectingId(id);
    const res = await fetch(`/api/accounts/${id}`, { method: "DELETE" });
    setDisconnectingId(null);
    if (res.ok) { setAccounts((prev) => prev.filter((a) => a.id !== id)); showToast("Verbindung gelöscht.", "warning"); }
    else showToast("Fehler beim Löschen.", "error");
  }

  const connectedCount = accounts.filter(
    (a) => a.connection_status === "connected" || a.connection_status === "connected_limited" || a.connection_status === "manual"
  ).length;

  return (
    <>
      <CutterNav />
      {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}

      <main className="mx-auto max-w-2xl p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">Plattform-Verbindungen</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {connectedCount > 0
              ? `${connectedCount} von 4 Plattformen verbunden`
              : "Verbinde deine Kanäle für automatisches View-Tracking"}
          </p>
        </div>

        <div className="space-y-3">
          {PLATFORM_ORDER.map((platform) => {
            const account = accounts.find((a) => a.platform === platform) ?? null;
            return (
              <PlatformCard
                key={platform}
                platform={platform}
                account={account}
                oauthReady={oauthConfigured[platform]}
                disconnecting={disconnectingId === account?.id}
                onConnect={() => { window.location.href = `/api/auth/${platform}`; }}
                onManual={(h) => handleManual(platform, h)}
                onDisconnect={() => account && handleDisconnect(account.id)}
                onReconnect={() => { window.location.href = `/api/auth/${platform}`; }}
              />
            );
          })}
        </div>
      </main>
    </>
  );
}

export default function CutterAccountsPage() {
  return <Suspense><AccountsPageInner /></Suspense>;
}
