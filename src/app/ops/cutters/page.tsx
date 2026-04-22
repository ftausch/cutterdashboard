"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CutterNav } from "@/components/cutter-nav";
import {
  Users, Plus, Mail, RefreshCw, CheckCircle,
  ChevronRight, UserX, UserCheck, X, Link2, Copy,
} from "lucide-react";

interface Cutter {
  id: string; name: string; email: string; role: string;
  is_active: number; rate_per_view: number; video_count: number;
  total_invoiced: number; total_views: number; created_at: string;
}

function formatEur(n: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);
}
function formatNum(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  return String(n);
}
function timeAgo(iso: string) {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (d === 0) return "heute"; if (d === 1) return "gestern"; return `vor ${d} Tagen`;
}

const ROLE_LABELS: Record<string, string> = {
  cutter: "Cutter", ops_manager: "Ops Manager", super_admin: "Super Admin", viewer: "Viewer",
};

// ── Invite Modal ───────────────────────────────────────────────────
function InviteModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [name,       setName]       = useState("");
  const [email,      setEmail]      = useState("");
  const [rate,       setRate]       = useState("0.01");
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [done,       setDone]       = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied,     setCopied]     = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError(null);
    const res  = await fetch("/api/admin/cutters", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, rate_per_view: parseFloat(rate) }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setError(data.error || "Fehler"); return; }
    if (data.invite_token) setInviteLink(`${window.location.origin}/api/auth/verify?token=${data.invite_token}`);
    setDone(true); onSuccess();
  }

  async function copyLink() {
    if (!inviteLink) return;
    await navigator.clipboard.writeText(inviteLink);
    setCopied(true); setTimeout(() => setCopied(false), 2500);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-card shadow-2xl shadow-black/50">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="font-semibold text-sm">Cutter einladen</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Einladungslink per E-Mail senden</p>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 text-muted-foreground/50 hover:bg-accent hover:text-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {done ? (
          <div className="flex flex-col items-center gap-3 p-8 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 border border-emerald-500/25">
              <CheckCircle className="h-6 w-6 text-emerald-400" />
            </div>
            <div>
              <p className="font-semibold">Einladung gesendet</p>
              <p className="text-sm text-muted-foreground mt-1">
                {name} erhält eine E-Mail mit einem Aktivierungslink (gültig 7 Tage).
              </p>
            </div>
            {inviteLink && (
              <div className="w-full mt-1 rounded-md border border-border bg-muted/20 p-3 text-left">
                <p className="text-xs text-muted-foreground mb-1.5">Backup-Link</p>
                <div className="flex items-center gap-2">
                  <p className="flex-1 truncate text-xs font-mono text-foreground/70">{inviteLink}</p>
                  <button
                    onClick={copyLink}
                    className="shrink-0 flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-accent transition-colors"
                  >
                    {copied ? <><CheckCircle className="h-3 w-3 text-emerald-400" /> Kopiert</> : <><Copy className="h-3 w-3" /> Kopieren</>}
                  </button>
                </div>
              </div>
            )}
            <button
              onClick={onClose}
              className="mt-1 rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Schließen
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="p-5 space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Name *</label>
              <input
                required value={name} onChange={(e) => setName(e.target.value)}
                placeholder="Max Mustermann"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:border-primary/60 transition-colors"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">E-Mail *</label>
              <input
                required type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="max@example.com"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:border-primary/60 transition-colors"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Rate pro View (€)</label>
              <input
                type="number" step="0.001" min="0" value={rate} onChange={(e) => setRate(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:border-primary/60 transition-colors"
              />
              <p className="mt-1 text-xs text-muted-foreground/60">Kann später angepasst werden.</p>
            </div>

            {error && (
              <p className="rounded-md border border-red-500/20 bg-red-500/8 px-3 py-2 text-xs text-red-400">{error}</p>
            )}

            <div className="flex gap-2 pt-1">
              <button
                type="button" onClick={onClose}
                className="flex-1 rounded-md border border-border py-2 text-sm text-muted-foreground hover:bg-accent transition-colors"
              >
                Abbrechen
              </button>
              <button
                type="submit" disabled={saving}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-md bg-primary py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40"
              >
                <Mail className="h-3.5 w-3.5" />
                {saving ? "Wird gesendet…" : "Einladen & Senden"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ── Cutter row ─────────────────────────────────────────────────────
function CutterRow({ c, onResend, onCopyLink, onLink, onDeactivate, resending, copying, resendDone, copiedLink }: {
  c: Cutter;
  onResend: () => void; onCopyLink: () => void; onLink: string; onDeactivate: () => void;
  resending: boolean; copying: boolean; resendDone: boolean; copiedLink: boolean;
}) {
  return (
    <div className="flex items-center justify-between px-5 py-4 hover:bg-accent/20 transition-colors">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-0.5">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
            {c.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)}
          </div>
          <p className="font-medium text-sm">{c.name}</p>
          <span className="rounded-md border border-border bg-muted/20 px-1.5 py-0.5 text-xs text-muted-foreground/60">
            {ROLE_LABELS[c.role] || c.role}
          </span>
        </div>
        <p className="text-xs text-muted-foreground ml-9">{c.email}</p>
        <div className="mt-1.5 ml-9 flex items-center gap-3 text-xs text-muted-foreground/60">
          <span>{c.video_count} Videos</span>
          <span className="text-muted-foreground/20">·</span>
          <span>{formatNum(c.total_views)} Views</span>
          <span className="text-muted-foreground/20">·</span>
          <span>{formatEur(c.total_invoiced)} abgerechnet</span>
          <span className="text-muted-foreground/20">·</span>
          <span>Eingetreten {timeAgo(c.created_at)}</span>
        </div>
      </div>
      <div className="flex items-center gap-1.5 ml-4 shrink-0">
        <button
          onClick={onResend} disabled={resending || copying} title="Einladungslink per E-Mail senden"
          className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-40"
        >
          {resendDone ? <><CheckCircle className="h-3.5 w-3.5 text-emerald-400" /> Gesendet</> : resending ? <><RefreshCw className="h-3.5 w-3.5 animate-spin" /> …</> : <><Mail className="h-3.5 w-3.5" /> E-Mail</>}
        </button>
        <button
          onClick={onCopyLink} disabled={copying || resending} title="Einladungslink kopieren"
          className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-40"
        >
          {copiedLink ? <><CheckCircle className="h-3.5 w-3.5 text-emerald-400" /> Kopiert</> : copying ? <><RefreshCw className="h-3.5 w-3.5 animate-spin" /> …</> : <><Link2 className="h-3.5 w-3.5" /> Link</>}
        </button>
        <Link
          href={onLink}
          className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          Details <ChevronRight className="h-3.5 w-3.5" />
        </Link>
        <button
          onClick={onDeactivate} title="Deaktivieren"
          className="rounded-md border border-border p-1.5 text-muted-foreground/40 hover:text-red-400 hover:border-red-500/25 hover:bg-red-500/8 transition-colors"
        >
          <UserX className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────
export default function OpsCuttersPage() {
  const router = useRouter();
  const [cutters,      setCutters]      = useState<Cutter[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [showInvite,   setShowInvite]   = useState(false);
  const [resendingId,  setResendingId]  = useState<string | null>(null);
  const [resendDone,   setResendDone]   = useState<string | null>(null);
  const [copyingId,    setCopyingId]    = useState<string | null>(null);
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);

  function load() {
    fetch("/api/admin/cutters")
      .then((r) => {
        if (r.status === 401) { router.push("/login?redirect=/ops/cutters"); return null; }
        if (r.status === 403) { router.push("/login"); return null; }
        return r.json();
      })
      .then((d) => { if (d) setCutters(d.cutters); setLoading(false); });
  }

  useEffect(() => { load(); }, []);

  async function resendInvite(id: string) {
    setResendingId(id);
    const res = await fetch(`/api/admin/cutters/${id}/invite`, { method: "POST" });
    setResendingId(null);
    if (res.ok) { setResendDone(id); setTimeout(() => setResendDone(null), 3000); }
  }

  async function copyInviteLink(id: string) {
    setCopyingId(id);
    const res = await fetch(`/api/admin/cutters/${id}/invite`, { method: "POST" });
    setCopyingId(null);
    if (res.ok) {
      const data = await res.json();
      await navigator.clipboard.writeText(`${window.location.origin}/api/auth/verify?token=${data.token}`);
      setCopiedLinkId(id); setTimeout(() => setCopiedLinkId(null), 3000);
    }
  }

  async function toggleActive(cutter: Cutter) {
    await fetch("/api/admin/cutters", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: cutter.id, is_active: cutter.is_active ? 0 : 1 }),
    });
    load();
  }

  const active   = cutters.filter((c) => c.is_active);
  const inactive = cutters.filter((c) => !c.is_active);

  return (
    <>
      <CutterNav />
      {showInvite && <InviteModal onClose={() => setShowInvite(false)} onSuccess={load} />}

      <main className="mx-auto max-w-5xl px-6 py-8 space-y-6">

        {/* ── Page header ──────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Cutter</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {cutters.length > 0 ? `${cutters.length} Cutter · ${active.length} aktiv` : "Noch keine Cutter eingeladen"}
            </p>
          </div>
          <button
            onClick={() => setShowInvite(true)}
            className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 transition-opacity"
          >
            <Plus className="h-3.5 w-3.5" />
            Cutter einladen
          </button>
        </div>

        {/* ── Summary strip ─────────────────────────────────────── */}
        {!loading && cutters.length > 0 && (
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground mb-2">Aktive Cutter</p>
              <p className="text-xl font-bold tabular-nums">{active.length}</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground mb-2">Views gesamt</p>
              <p className="text-xl font-bold tabular-nums">{formatNum(cutters.reduce((s, c) => s + c.total_views, 0))}</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground mb-2">Abgerechnet gesamt</p>
              <p className="text-xl font-bold tabular-nums">{formatEur(cutters.reduce((s, c) => s + c.total_invoiced, 0))}</p>
            </div>
          </div>
        )}

        {/* ── Cutter list ───────────────────────────────────────── */}
        {loading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="rounded-lg border border-border bg-card p-4">
                <div className="skeleton h-4 w-48 mb-2.5" /><div className="skeleton h-3 w-32" />
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {/* Active */}
            <div className="rounded-lg border border-border bg-card overflow-hidden">
              <div className="border-b border-border px-5 py-3">
                <h2 className="text-sm font-semibold">Aktive Cutter
                  <span className="ml-2 text-muted-foreground/50 font-normal">({active.length})</span>
                </h2>
              </div>
              {active.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-14 text-center">
                  <Users className="h-7 w-7 text-muted-foreground/15 mb-1" />
                  <p className="text-sm text-muted-foreground">Noch keine aktiven Cutter.</p>
                  <button
                    onClick={() => setShowInvite(true)}
                    className="mt-1.5 flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
                  >
                    <Plus className="h-3.5 w-3.5" /> Ersten Cutter einladen
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {active.map((c) => (
                    <CutterRow
                      key={c.id} c={c}
                      onResend={() => resendInvite(c.id)}
                      onCopyLink={() => copyInviteLink(c.id)}
                      onLink={`/ops/cutters/${c.id}`}
                      onDeactivate={() => toggleActive(c)}
                      resending={resendingId === c.id}
                      copying={copyingId === c.id}
                      resendDone={resendDone === c.id}
                      copiedLink={copiedLinkId === c.id}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Inactive */}
            {inactive.length > 0 && (
              <div className="rounded-lg border border-border/40 bg-card/60 overflow-hidden opacity-60">
                <div className="border-b border-border/40 px-5 py-3">
                  <h2 className="text-sm font-semibold text-muted-foreground">Deaktiviert
                    <span className="ml-2 font-normal">({inactive.length})</span>
                  </h2>
                </div>
                <div className="divide-y divide-border/40">
                  {inactive.map((c) => (
                    <div key={c.id} className="flex items-center justify-between px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted/40 text-xs font-bold text-muted-foreground/40">
                          {c.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)}
                        </div>
                        <div>
                          <p className="text-sm line-through text-muted-foreground/50">{c.name}</p>
                          <p className="text-xs text-muted-foreground/40">{c.email}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => toggleActive(c)}
                        className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:text-emerald-400 hover:border-emerald-500/25 hover:bg-emerald-500/8 transition-colors"
                      >
                        <UserCheck className="h-3.5 w-3.5" /> Reaktivieren
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

      </main>
    </>
  );
}
