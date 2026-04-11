"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CutterNav } from "@/components/cutter-nav";
import {
  PLATFORM_ORDER, PLATFORM_DEFS, CONNECTION_STATUS_META, CONFIDENCE_META,
  type Platform, type ConnectionStatus, type VerificationConfidence,
} from "@/lib/platforms";
import {
  CheckCircle2, AlertTriangle, XCircle, Eye, EyeOff,
  ShieldCheck, Trash2, ExternalLink, RefreshCw, Plus,
  ChevronDown, ChevronUp,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────
interface ConnectedAccount {
  id: string;
  platform: Platform;
  account_handle: string | null;
  account_url: string | null;
  platform_user_id: string | null;
  connection_status: ConnectionStatus;
  connection_type: "oauth" | "manual";
  views_accessible: boolean;
  verification_confidence: VerificationConfidence;
  oauth_scopes: string | null;
  capability_flags: string | null;
  sync_error: string | null;
  token_expires_at: string | null;
  has_token: boolean;
  created_at: string;
  updated_at: string;
  last_synced_at: string | null;
}

type OAuthConfigured = Record<Platform, boolean>;

// ── Toast ──────────────────────────────────────────────────────
function Toast({ message, type, onDismiss }: {
  message: string; type: "success" | "error" | "warning"; onDismiss: () => void;
}) {
  const colors = {
    success: "bg-emerald-600/90 text-white border-emerald-500/50",
    error:   "bg-red-600/90 text-white border-red-500/50",
    warning: "bg-yellow-600/90 text-white border-yellow-500/50",
  };
  return (
    <div
      onClick={onDismiss}
      className={`fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium shadow-xl cursor-pointer backdrop-blur-sm ${colors[type]}`}
    >
      {type === "success" ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
      {message}
    </div>
  );
}

// ── Connection status badge ────────────────────────────────────
function StatusBadge({ status }: { status: ConnectionStatus }) {
  const meta = CONNECTION_STATUS_META[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${meta.color} ${meta.bg} ${meta.border}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
}

// ── View access badge ──────────────────────────────────────────
function ViewBadge({ accessible }: { accessible: boolean }) {
  return accessible ? (
    <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-400">
      <Eye className="h-3 w-3" /> Views: Verfügbar
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-md border border-border/50 bg-muted/20 px-2 py-0.5 text-xs font-medium text-muted-foreground">
      <EyeOff className="h-3 w-3" /> Views: Nicht verfügbar
    </span>
  );
}

// ── Confidence badge ───────────────────────────────────────────
function ConfidenceBadge({ level }: { level: VerificationConfidence }) {
  const meta = CONFIDENCE_META[level];
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium ${meta.color} ${meta.bg} ${meta.border}`}>
      <ShieldCheck className="h-3 w-3" /> {meta.label}
    </span>
  );
}

// ── Capability checklist ───────────────────────────────────────
function CapabilityRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`flex items-center gap-1 text-xs ${ok ? "text-muted-foreground" : "text-muted-foreground/40"}`}>
      {ok
        ? <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />
        : <XCircle      className="h-3 w-3 text-muted-foreground/30 shrink-0" />
      }
      {label}
    </span>
  );
}

// ── Manual handle input ────────────────────────────────────────
function ManualInput({ platform, onSave, onCancel }: {
  platform: Platform;
  onSave: (handle: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState("");
  const def = PLATFORM_DEFS[platform];
  return (
    <div className="flex items-center gap-2 mt-3">
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={def.placeholder}
        className="h-8 flex-1 rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-primary"
        onKeyDown={(e) => e.key === "Enter" && value.trim() && onSave(value.trim())}
      />
      <button
        onClick={() => value.trim() && onSave(value.trim())}
        disabled={!value.trim()}
        className="rounded-lg bg-primary px-3 h-8 text-xs font-medium text-primary-foreground disabled:opacity-40"
      >
        Speichern
      </button>
      <button
        onClick={onCancel}
        className="rounded-lg border border-border px-3 h-8 text-xs text-muted-foreground hover:text-foreground"
      >
        ✕
      </button>
    </div>
  );
}

// ── Platform card ──────────────────────────────────────────────
function PlatformCard({
  platform,
  account,
  oauthReady,
  onConnect,
  onManual,
  onDisconnect,
  onReconnect,
}: {
  platform: Platform;
  account: ConnectedAccount | null;
  oauthReady: boolean;
  onConnect:    () => void;
  onManual:     (handle: string) => void;
  onDisconnect: () => void;
  onReconnect:  () => void;
}) {
  const def    = PLATFORM_DEFS[platform];
  const status = account?.connection_status ?? "not_connected";
  const isConnected = status === "connected" || status === "connected_limited";
  const isManual    = status === "manual";
  const isExpired   = status === "token_expired";
  const isError     = status === "error";

  const [showManualInput, setShowManualInput] = useState(false);
  const [showDetails, setShowDetails]         = useState(false);

  // Capability flags (live account or static platform def for preview)
  const caps = account?.capability_flags
    ? (() => { try { return JSON.parse(account.capability_flags); } catch { return {}; } })()
    : null;

  const viewsAccessible    = account?.views_accessible ?? false;
  const confidence         = account?.verification_confidence ?? "none";
  const connectionType     = account?.connection_type ?? "manual";

  // Platform's best-case capabilities (shown when not connected)
  const maxConfidence   = def.max_confidence;
  const viewsAvailable  = def.views_available;

  return (
    <div className={`rounded-xl border bg-card transition-all duration-200 ${
      isConnected
        ? "border-emerald-500/25"
        : isManual
        ? "border-yellow-500/20"
        : isExpired || isError
        ? "border-orange-500/25"
        : "border-border/60"
    }`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <div className="flex items-center gap-3">
          {/* Platform icon chip */}
          <div className={`flex h-9 w-9 items-center justify-center rounded-lg text-base font-bold border ${def.color_text} ${def.color_bg} ${def.color_border}`}>
            {def.emoji}
          </div>
          <div>
            <p className="text-sm font-semibold">{def.label}</p>
            {account?.account_handle && (
              <p className="text-xs text-muted-foreground">@{account.account_handle}</p>
            )}
          </div>
        </div>
        <StatusBadge status={status} />
      </div>

      {/* Capability row */}
      <div className="flex flex-wrap items-center gap-2 px-4 pb-3">
        {isConnected || isManual ? (
          <>
            <ViewBadge accessible={viewsAccessible} />
            <ConfidenceBadge level={confidence} />
            {connectionType === "oauth" && (
              <span className="inline-flex items-center gap-1 rounded-md border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-400">
                OAuth
              </span>
            )}
          </>
        ) : (
          <>
            {/* Preview of what this platform CAN do */}
            <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium ${
              viewsAvailable
                ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-400/70"
                : "border-border/40 bg-muted/10 text-muted-foreground/50"
            }`}>
              <Eye className="h-3 w-3" />
              {viewsAvailable ? "Views möglich" : "Views nicht verfügbar"}
            </span>
            <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium ${CONFIDENCE_META[maxConfidence].color}/60 ${CONFIDENCE_META[maxConfidence].bg.replace('/10','/5')} border-border/30`}>
              <ShieldCheck className="h-3 w-3" />
              max. {CONFIDENCE_META[maxConfidence].label}
            </span>
          </>
        )}
      </div>

      {/* Token expiry warning */}
      {isExpired && (
        <div className="mx-4 mb-3 flex items-center gap-2 rounded-lg border border-orange-500/30 bg-orange-500/10 px-3 py-2 text-xs text-orange-400">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          Zugriffstoken abgelaufen — bitte neu verbinden, um View-Daten abzurufen.
        </div>
      )}

      {/* Sync error */}
      {isError && account?.sync_error && (
        <div className="mx-4 mb-3 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
          <XCircle className="h-3.5 w-3.5 shrink-0" />
          {account.sync_error}
        </div>
      )}

      {/* Limitation note */}
      {def.limitation_note && !isConnected && (
        <div className="mx-4 mb-3 flex items-start gap-2 text-xs text-muted-foreground/70">
          <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0 text-yellow-500/60" />
          {def.limitation_note}
        </div>
      )}

      {/* Expandable details */}
      {(isConnected || isManual) && (
        <button
          onClick={() => setShowDetails((d) => !d)}
          className="flex w-full items-center gap-1 px-4 py-1.5 text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors border-t border-border/30"
        >
          {showDetails ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          {showDetails ? "Details ausblenden" : "Details anzeigen"}
        </button>
      )}

      {showDetails && (
        <div className="px-4 pb-3 pt-2 space-y-1.5 border-t border-border/20">
          <CapabilityRow ok={connectionType === "oauth"}  label="Offizieller API-Zugriff (OAuth)" />
          <CapabilityRow ok={viewsAccessible}              label="View-Daten verfügbar" />
          <CapabilityRow ok={caps?.video_list_available ?? def.video_list_accessible} label="Video-Liste abrufbar" />
          <CapabilityRow ok={caps?.clip_level_metrics   ?? def.clip_level_views}      label="Clip-Metriken pro Video" />
          {account?.token_expires_at && (
            <p className="text-xs text-muted-foreground/50 pt-1">
              Token gültig bis: {new Date(account.token_expires_at).toLocaleDateString("de-DE")}
            </p>
          )}
          {account?.last_synced_at && (
            <p className="text-xs text-muted-foreground/50">
              Letzter Sync: {new Date(account.last_synced_at).toLocaleString("de-DE")}
            </p>
          )}
        </div>
      )}

      {/* Manual handle input */}
      {showManualInput && (
        <div className="px-4 pb-4 border-t border-border/30 pt-3">
          <ManualInput
            platform={platform}
            onSave={(h) => { setShowManualInput(false); onManual(h); }}
            onCancel={() => setShowManualInput(false)}
          />
        </div>
      )}

      {/* Action buttons */}
      {!showManualInput && (
        <div className="flex items-center gap-2 px-4 pb-4 pt-2 border-t border-border/30 flex-wrap">
          {!account && (
            oauthReady ? (
              <button
                onClick={onConnect}
                className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 transition-opacity"
              >
                <Plus className="h-3.5 w-3.5" />
                {def.connect_label}
              </button>
            ) : (
              <>
                <button
                  onClick={() => setShowManualInput(true)}
                  className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Handle manuell eintragen
                </button>
                <span className="text-xs text-muted-foreground/50">{def.connect_label} (OAuth nicht konfiguriert)</span>
              </>
            )
          )}

          {isManual && oauthReady && (
            <button
              onClick={onConnect}
              className="flex items-center gap-1.5 rounded-lg bg-primary/20 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/30 transition-colors"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Per OAuth verbinden
            </button>
          )}

          {(isExpired || isError) && (
            <button
              onClick={onReconnect}
              className="flex items-center gap-1.5 rounded-lg bg-orange-500/20 px-3 py-1.5 text-xs font-medium text-orange-400 hover:bg-orange-500/30 transition-colors"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Neu verbinden
            </button>
          )}

          {account?.account_handle && (
            <a
              href={`${def.url_prefix}${account.account_handle}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors"
            >
              <ExternalLink className="h-3 w-3" />
              Profil
            </a>
          )}

          {account && (
            <button
              onClick={onDisconnect}
              className="ml-auto flex items-center gap-1 text-xs text-muted-foreground/50 hover:text-destructive transition-colors"
            >
              <Trash2 className="h-3 w-3" />
              Trennen
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Summary bar ────────────────────────────────────────────────
function VerificationSummary({ accounts }: { accounts: ConnectedAccount[] }) {
  const withViews = accounts.filter((a) => a.views_accessible).length;
  const connected = accounts.filter((a) =>
    a.connection_status === "connected" || a.connection_status === "connected_limited"
  ).length;
  const highConf  = accounts.filter((a) => a.verification_confidence === "high").length;

  return (
    <div className="mb-6 grid grid-cols-3 gap-3">
      {[
        { label: "Verbunden",         value: connected, max: 4, color: "text-foreground" },
        { label: "Views verfügbar",   value: withViews, max: 4, color: "text-emerald-400" },
        { label: "Hohe Konfidenz",    value: highConf,  max: 4, color: "text-blue-400"    },
      ].map(({ label, value, max, color }) => (
        <div key={label} className="rounded-xl border border-border bg-card px-4 py-3 text-center">
          <p className={`text-2xl font-bold tabular-nums ${color}`}>{value}<span className="text-sm font-normal text-muted-foreground">/{max}</span></p>
          <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
        </div>
      ))}
    </div>
  );
}

// ── Page inner ─────────────────────────────────────────────────
function AccountsPageInner() {
  const router       = useRouter();
  const searchParams = useSearchParams();

  const [accounts,       setAccounts]       = useState<ConnectedAccount[]>([]);
  const [oauthConfigured, setOauthConfigured] = useState<OAuthConfigured>({
    youtube: false, instagram: false, facebook: false, tiktok: false,
  });
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "warning" } | null>(null);

  function showToast(message: string, type: "success" | "error" | "warning") {
    setToast({ message, type });
    setTimeout(() => setToast(null), 5000);
  }

  // Handle OAuth callback result params
  useEffect(() => {
    const success = searchParams.get("success");
    const error   = searchParams.get("error");

    const MESSAGES: Record<string, [string, "success" | "error" | "warning"]> = {
      youtube_connected:    ["YouTube erfolgreich verbunden. Views werden abgerufen.", "success"],
      instagram_connected:  ["Instagram erfolgreich verbunden.", "success"],
      youtube_denied:       ["YouTube-Verbindung abgebrochen.", "warning"],
      instagram_denied:     ["Instagram-Verbindung abgelehnt.", "warning"],
      invalid_state:        ["Sicherheitsfehler. Bitte erneut versuchen.", "error"],
      youtube_failed:       ["YouTube-Verbindung fehlgeschlagen.", "error"],
      youtube_not_configured: ["YouTube OAuth ist noch nicht konfiguriert.", "warning"],
      youtube_no_channel:   ["Kein YouTube-Kanal gefunden.", "error"],
      instagram_failed:     ["Instagram-Verbindung fehlgeschlagen.", "error"],
    };

    const key = success ? `${success}` : error ? `${error}` : null;
    if (key && MESSAGES[key]) {
      showToast(...MESSAGES[key]);
      router.replace("/accounts");
    }
  }, [searchParams, router]);

  function loadAccounts() {
    fetch("/api/accounts")
      .then((r) => {
        if (r.status === 401) { router.push("/login"); return null; }
        return r.json();
      })
      .then((data) => {
        if (!data) return;
        setAccounts(data.accounts ?? []);
        if (data.oauth_configured) setOauthConfigured(data.oauth_configured);
      });
  }

  useEffect(() => { loadAccounts(); }, [router]);

  async function handleManual(platform: Platform, handle: string) {
    const res = await fetch("/api/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platform, account_handle: handle }),
    });
    if (res.ok) {
      showToast("Handle gespeichert. Views sind ohne OAuth-Verbindung nicht verifizierbar.", "warning");
      loadAccounts();
    } else {
      const d = await res.json();
      showToast(d.error || "Fehler beim Speichern.", "error");
    }
  }

  async function handleDisconnect(id: string) {
    if (!confirm("Konto-Verbindung wirklich trennen?")) return;
    const res = await fetch(`/api/accounts/${id}`, { method: "DELETE" });
    if (res.ok) {
      setAccounts((prev) => prev.filter((a) => a.id !== id));
      showToast("Konto getrennt.", "warning");
    }
  }

  function handleOAuth(platform: Platform) {
    window.location.href = `/api/auth/${platform}`;
  }

  return (
    <>
      <CutterNav />
      {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}

      <main className="mx-auto max-w-3xl p-6">

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">Plattform-Verbindungen</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Verbinde deine Kanäle, damit wir View-Zahlen direkt über offizielle APIs verifizieren können.
            Views sind unser primärer Verifizierungsindikator.
          </p>
        </div>

        {/* Summary */}
        <VerificationSummary accounts={accounts} />

        {/* Platform cards */}
        <div className="space-y-4">
          {PLATFORM_ORDER.map((platform) => {
            const account = accounts.find((a) => a.platform === platform) ?? null;
            return (
              <PlatformCard
                key={platform}
                platform={platform}
                account={account}
                oauthReady={oauthConfigured[platform]}
                onConnect={()         => handleOAuth(platform)}
                onManual={(h)         => handleManual(platform, h)}
                onDisconnect={()      => account && handleDisconnect(account.id)}
                onReconnect={()       => handleOAuth(platform)}
              />
            );
          })}
        </div>

        {/* Info callout */}
        <div className="mt-6 rounded-xl border border-border/40 bg-card/50 px-4 py-3">
          <div className="flex items-start gap-3">
            <Eye className="h-4 w-4 mt-0.5 text-primary shrink-0" />
            <div className="text-xs text-muted-foreground space-y-1">
              <p className="font-medium text-foreground/80">Warum View-Zugriff so wichtig ist</p>
              <p>
                Wir verwenden ausschließlich offizielle View-Zahlen für die Vergütungsberechnung.
                Eine OAuth-Verbindung ermöglicht uns, View-Daten direkt aus der Plattform-API abzurufen —
                ohne manuelle Angaben des Cutters. Das erhöht die Verifizierungskonfidenz und beschleunigt
                die Abrechnung.
              </p>
              <p>
                <span className="text-emerald-400 font-medium">Hohe Konfidenz</span> = offizielle API, clip-genaue Views. ·{" "}
                <span className="text-yellow-400 font-medium">Mittlere Konfidenz</span> = API verfügbar, ggf. Business-Konto erforderlich. ·{" "}
                <span className="text-muted-foreground/70 font-medium">Keine</span> = nur manuell, keine Verifikation möglich.
              </p>
            </div>
          </div>
        </div>

      </main>
    </>
  );
}

export default function CutterAccountsPage() {
  return (
    <Suspense>
      <AccountsPageInner />
    </Suspense>
  );
}
