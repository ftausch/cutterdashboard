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
  id: string;
  name: string;
  email: string;
  role: string;
  is_active: number;
  rate_per_view: number;
  video_count: number;
  total_invoiced: number;
  total_views: number;
  created_at: string;
}

function formatEur(n: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);
}
function formatNum(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
function timeAgo(iso: string) {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (d === 0) return "heute";
  if (d === 1) return "gestern";
  return `vor ${d} Tagen`;
}

const ROLE_LABELS: Record<string, string> = {
  cutter:      "Cutter",
  ops_manager: "Ops Manager",
  super_admin: "Super Admin",
  viewer:      "Viewer",
};

// ── Invite / Create modal ─────────────────────────────────────────
function InviteModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [name, setName]         = useState("");
  const [email, setEmail]       = useState("");
  const [rate, setRate]         = useState("0.01");
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [done, setDone]         = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied]     = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const res = await fetch("/api/admin/cutters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, rate_per_view: parseFloat(rate) }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setError(data.error || "Fehler"); return; }
    if (data.invite_token) {
      setInviteLink(`${window.location.origin}/api/auth/verify?token=${data.invite_token}`);
    }
    setDone(true);
    onSuccess();
  }

  async function copyLink() {
    if (!inviteLink) return;
    await navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="font-semibold">Cutter einladen</h2>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-accent transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {done ? (
          <div className="flex flex-col items-center gap-3 p-8 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/15 border border-emerald-500/30">
              <CheckCircle className="h-7 w-7 text-emerald-400" />
            </div>
            <p className="font-semibold">Einladung gesendet!</p>
            <p className="text-sm text-muted-foreground">
              {name} erhält eine E-Mail mit einem Aktivierungslink (gültig 7 Tage).
            </p>
            {inviteLink && (
              <div className="w-full mt-1 rounded-lg border border-border bg-muted/40 p-3 text-left">
                <p className="text-xs text-muted-foreground mb-1.5">Backup-Link (falls E-Mail nicht ankommt)</p>
                <div className="flex items-center gap-2">
                  <p className="flex-1 truncate text-xs font-mono text-foreground">{inviteLink}</p>
                  <button
                    onClick={copyLink}
                    className="shrink-0 flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-accent transition-colors"
                  >
                    {copied ? <CheckCircle className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                    {copied ? "Kopiert" : "Kopieren"}
                  </button>
                </div>
              </div>
            )}
            <button
              onClick={onClose}
              className="mt-1 rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Schließen
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="p-5 space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Name *</label>
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Max Mustermann"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">E-Mail *</label>
              <input
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="max@example.com"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Rate pro View (€)</label>
              <input
                type="number"
                step="0.001"
                min="0"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              <p className="mt-1 text-xs text-muted-foreground">Kann später angepasst werden.</p>
            </div>

            {error && (
              <p className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-400">{error}</p>
            )}

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-lg border border-border py-2 text-sm text-muted-foreground hover:bg-accent transition-colors"
              >
                Abbrechen
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-primary py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
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

// ── Main page ─────────────────────────────────────────────────────
export default function OpsCuttersPage() {
  const router = useRouter();
  const [cutters, setCutters] = useState<Cutter[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [resendingId, setResendingId]   = useState<string | null>(null);
  const [resendDone, setResendDone]     = useState<string | null>(null);
  const [copyingId, setCopyingId]       = useState<string | null>(null);
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);

  function load() {
    fetch("/api/admin/cutters")
      .then((r) => {
        if (r.status === 401) { router.push("/login?redirect=/ops/cutters"); return null; }
        if (r.status === 403) { router.push("/login"); return null; }
        return r.json();
      })
      .then((d) => {
        if (d) setCutters(d.cutters);
        setLoading(false);
      });
  }

  useEffect(() => { load(); }, []);

  async function resendInvite(id: string) {
    setResendingId(id);
    const res = await fetch(`/api/admin/cutters/${id}/invite`, { method: "POST" });
    setResendingId(null);
    if (res.ok) {
      setResendDone(id);
      setTimeout(() => setResendDone(null), 3000);
    }
  }

  async function copyInviteLink(id: string) {
    setCopyingId(id);
    const res = await fetch(`/api/admin/cutters/${id}/invite`, { method: "POST" });
    setCopyingId(null);
    if (res.ok) {
      const data = await res.json();
      const link = `${window.location.origin}/api/auth/verify?token=${data.token}`;
      await navigator.clipboard.writeText(link);
      setCopiedLinkId(id);
      setTimeout(() => setCopiedLinkId(null), 3000);
    }
  }

  async function toggleActive(cutter: Cutter) {
    await fetch("/api/admin/cutters", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: cutter.id, is_active: cutter.is_active ? 0 : 1 }),
    });
    load();
  }

  const active   = cutters.filter((c) => c.is_active);
  const inactive = cutters.filter((c) => !c.is_active);

  return (
    <>
      <CutterNav />
      {showInvite && (
        <InviteModal
          onClose={() => setShowInvite(false)}
          onSuccess={load}
        />
      )}

      <main className="mx-auto max-w-5xl p-6">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">Cutter</h1>
            <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
              {cutters.length} gesamt
            </span>
          </div>
          <button
            onClick={() => setShowInvite(true)}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
          >
            <Plus className="h-4 w-4" />
            Cutter einladen
          </button>
        </div>

        {/* Stats row */}
        <div className="mb-6 grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground mb-1">Aktiv</p>
            <p className="text-2xl font-bold">{active.length}</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground mb-1">Views gesamt</p>
            <p className="text-2xl font-bold">{formatNum(cutters.reduce((s, c) => s + c.total_views, 0))}</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground mb-1">Abgerechnet gesamt</p>
            <p className="text-2xl font-bold">{formatEur(cutters.reduce((s, c) => s + c.total_invoiced, 0))}</p>
          </div>
        </div>

        {/* Cutter list */}
        {loading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="rounded-xl border border-border bg-card p-4">
                <div className="skeleton h-4 w-48 mb-2" />
                <div className="skeleton h-3 w-32" />
              </div>
            ))}
          </div>
        ) : (
          <>
            {/* Active cutters */}
            <div className="rounded-xl border border-border bg-card overflow-hidden mb-4">
              <div className="border-b border-border px-5 py-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold">Aktive Cutter ({active.length})</h2>
              </div>
              {active.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-10 text-center">
                  <Users className="h-8 w-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Noch keine aktiven Cutter.</p>
                  <button
                    onClick={() => setShowInvite(true)}
                    className="mt-1 flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Ersten Cutter einladen
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {active.map((c) => (
                    <div key={c.id} className="flex items-center justify-between px-5 py-4 hover:bg-accent/30 transition-colors">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-0.5">
                          <p className="font-medium text-sm">{c.name}</p>
                          <span className="rounded px-1.5 py-0.5 text-xs bg-muted text-muted-foreground">
                            {ROLE_LABELS[c.role] || c.role}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">{c.email}</p>
                        <div className="mt-1.5 flex items-center gap-3 text-xs text-muted-foreground">
                          <span>{c.video_count} Videos</span>
                          <span>·</span>
                          <span>{formatNum(c.total_views)} Views</span>
                          <span>·</span>
                          <span>{formatEur(c.total_invoiced)} abgerechnet</span>
                          <span>·</span>
                          <span>Eingetreten {timeAgo(c.created_at)}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 ml-4 shrink-0">
                        {/* Resend invite email */}
                        <button
                          onClick={() => resendInvite(c.id)}
                          disabled={resendingId === c.id || copyingId === c.id}
                          title="Einladungslink per E-Mail senden"
                          className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
                        >
                          {resendDone === c.id ? (
                            <><CheckCircle className="h-3.5 w-3.5 text-emerald-400" /> Gesendet</>
                          ) : resendingId === c.id ? (
                            <><RefreshCw className="h-3.5 w-3.5 animate-spin" /> …</>
                          ) : (
                            <><Mail className="h-3.5 w-3.5" /> E-Mail</>
                          )}
                        </button>
                        {/* Copy invite link */}
                        <button
                          onClick={() => copyInviteLink(c.id)}
                          disabled={copyingId === c.id || resendingId === c.id}
                          title="Einladungslink in die Zwischenablage kopieren"
                          className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
                        >
                          {copiedLinkId === c.id ? (
                            <><CheckCircle className="h-3.5 w-3.5 text-emerald-400" /> Kopiert</>
                          ) : copyingId === c.id ? (
                            <><RefreshCw className="h-3.5 w-3.5 animate-spin" /> …</>
                          ) : (
                            <><Link2 className="h-3.5 w-3.5" /> Link</>
                          )}
                        </button>
                        {/* Detail link */}
                        <Link
                          href={`/ops/cutters/${c.id}`}
                          className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                        >
                          Details <ChevronRight className="h-3.5 w-3.5" />
                        </Link>
                        {/* Deactivate */}
                        <button
                          onClick={() => toggleActive(c)}
                          title="Deaktivieren"
                          className="rounded-lg border border-border p-1.5 text-muted-foreground hover:text-red-400 hover:border-red-500/30 hover:bg-red-500/10 transition-colors"
                        >
                          <UserX className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Inactive cutters */}
            {inactive.length > 0 && (
              <div className="rounded-xl border border-border bg-card overflow-hidden opacity-60">
                <div className="border-b border-border px-5 py-3">
                  <h2 className="text-sm font-semibold text-muted-foreground">Deaktiviert ({inactive.length})</h2>
                </div>
                <div className="divide-y divide-border">
                  {inactive.map((c) => (
                    <div key={c.id} className="flex items-center justify-between px-5 py-3.5">
                      <div>
                        <p className="text-sm line-through text-muted-foreground">{c.name}</p>
                        <p className="text-xs text-muted-foreground">{c.email}</p>
                      </div>
                      <button
                        onClick={() => toggleActive(c)}
                        title="Reaktivieren"
                        className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:text-emerald-400 hover:border-emerald-500/30 hover:bg-emerald-500/10 transition-colors"
                      >
                        <UserCheck className="h-3.5 w-3.5" />
                        Reaktivieren
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </>
  );
}
