"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CutterNav } from "@/components/cutter-nav";
import { RefreshCw, ChevronLeft, Plus, CheckCircle2, AlertTriangle } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────
interface Profile {
  cutter_id:            string | null;
  cutter_name:          string | null;
  rate_per_view_legacy: number | null;
  profile_id:           string | null;
  rate_per_1k:          number | null;
  currency:             string;
  effective_from:       string | null;
  notes:                string | null;
  created_at:           string | null;
  created_by_name:      string | null;
  has_profile:          boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────
function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("de-DE", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });
}
function eur(n: number): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency", currency: "EUR", maximumFractionDigits: 4,
  }).format(n);
}

// ── New profile form ───────────────────────────────────────────────────
function NewProfileRow({
  cutterId,
  cutterName,
  onSaved,
}: {
  cutterId: string;
  cutterName: string;
  onSaved: () => void;
}) {
  const [open,     setOpen]     = useState(false);
  const [rate,     setRate]     = useState("");
  const [from,     setFrom]     = useState(new Date().toISOString().slice(0, 10));
  const [notes,    setNotes]    = useState("");
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  async function save() {
    const r = parseFloat(rate.replace(",", "."));
    if (!r || r <= 0) { setError("Bitte einen gültigen Betrag eingeben."); return; }
    setSaving(true);
    setError(null);
    const res = await fetch("/api/ops/billing/profiles", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ cutter_id: cutterId, rate_per_1k: r, effective_from: from, notes: notes || undefined }),
    });
    setSaving(false);
    if (!res.ok) {
      const d = await res.json();
      setError(d.error ?? "Fehler beim Speichern.");
      return;
    }
    setOpen(false);
    setRate(""); setNotes("");
    onSaved();
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
      >
        <Plus className="h-3 w-3" />
        Tarif anlegen
      </button>
    );
  }

  return (
    <div className="mt-2 rounded-lg border border-border bg-muted/10 p-3 space-y-2 text-xs">
      <p className="font-medium text-muted-foreground">Neuer Tarif für {cutterName}</p>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="block text-muted-foreground/70 mb-1">€ pro 1.000 Views</label>
          <input
            type="number"
            min="0.01"
            step="0.01"
            placeholder="z.B. 5.50"
            value={rate}
            onChange={e => setRate(e.target.value)}
            className="w-full rounded-md border border-border bg-card px-2 py-1.5 text-sm placeholder:text-muted-foreground/30 focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
        </div>
        <div>
          <label className="block text-muted-foreground/70 mb-1">Gültig ab</label>
          <input
            type="date"
            value={from}
            onChange={e => setFrom(e.target.value)}
            className="w-full rounded-md border border-border bg-card px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
        </div>
        <div>
          <label className="block text-muted-foreground/70 mb-1">Notiz (opt.)</label>
          <input
            type="text"
            placeholder="Notiz…"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            className="w-full rounded-md border border-border bg-card px-2 py-1.5 text-sm placeholder:text-muted-foreground/30 focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
        </div>
      </div>
      {error && <p className="text-red-400 text-xs">{error}</p>}
      <div className="flex items-center gap-2">
        <button
          onClick={save}
          disabled={saving}
          className="rounded-md bg-primary/10 border border-primary/20 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/15 disabled:opacity-40 transition-colors"
        >
          {saving ? "Speichere…" : "Speichern"}
        </button>
        <button
          onClick={() => { setOpen(false); setError(null); }}
          className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          Abbrechen
        </button>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────
export default function BillingProfilesPage() {
  const router = useRouter();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading,  setLoading]  = useState(true);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/ops/billing/profiles");
      if (res.status === 401) { router.push("/login"); return; }
      if (res.status === 403) { router.push("/dashboard"); return; }
      const data = await res.json();
      setProfiles(data.profiles ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const noProfile = profiles.filter(p => !p.has_profile);
  const hasProfile = profiles.filter(p => p.has_profile);

  return (
    <>
      <CutterNav />
      <main className="mx-auto max-w-4xl px-6 py-8 space-y-6">

        {/* Header */}
        <div>
          <Link
            href="/ops/billing"
            className="mb-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Zurück zur Abrechnung
          </Link>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Abrechnungstarife</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Tarif pro 1.000 Views (rate_per_1k) für jeden aktiven Cutter verwalten.
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
        </div>

        {/* Alert: cutters without profile */}
        {!loading && noProfile.length > 0 && (
          <div className="flex items-start gap-3 rounded-xl border border-yellow-500/20 bg-yellow-500/5 px-4 py-3">
            <AlertTriangle className="h-4 w-4 text-yellow-400 shrink-0 mt-0.5" />
            <p className="text-sm text-yellow-300">
              {noProfile.length} Cutter {noProfile.length === 1 ? "hat" : "haben"} noch keinen Tarif.
              Ohne Tarif können keine Batches erstellt werden.
            </p>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-20 text-muted-foreground/40 gap-2">
            <RefreshCw className="h-4 w-4 animate-spin" />
            <span className="text-sm">Lade Tarife…</span>
          </div>
        )}

        {/* Cutters with profile */}
        {!loading && hasProfile.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/50">
              Mit Tarif ({hasProfile.length})
            </h2>
            <div className="divide-y divide-border/40 rounded-xl border border-border bg-card overflow-hidden">
              {hasProfile.map(p => (
                <div key={p.cutter_id} className="px-5 py-4 space-y-3">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                      <span className="font-medium text-sm">{p.cutter_name}</span>
                    </div>
                    <div className="flex items-center gap-6 text-xs text-muted-foreground">
                      <div className="text-right">
                        <p className="text-foreground font-semibold tabular-nums">
                          {eur(p.rate_per_1k ?? 0)} <span className="font-normal text-muted-foreground">/ 1.000 Views</span>
                        </p>
                        <p className="mt-0.5 text-muted-foreground/60">ab {fmtDate(p.effective_from)}</p>
                      </div>
                      <div className="text-right text-muted-foreground/50">
                        <p>Von {p.created_by_name ?? "—"}</p>
                        <p>{fmtDate(p.created_at)}</p>
                      </div>
                    </div>
                  </div>
                  {p.notes && (
                    <p className="text-xs text-muted-foreground/60 italic pl-6">{p.notes}</p>
                  )}
                  {/* Add new rate button */}
                  <div className="pl-6">
                    <NewProfileRow
                      cutterId={p.cutter_id!}
                      cutterName={p.cutter_name!}
                      onSaved={load}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Cutters without profile */}
        {!loading && noProfile.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/50">
              Ohne Tarif ({noProfile.length})
            </h2>
            <div className="divide-y divide-border/40 rounded-xl border border-yellow-500/15 bg-card overflow-hidden">
              {noProfile.map(p => (
                <div key={p.cutter_id} className="px-5 py-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-yellow-400 shrink-0" />
                    <span className="font-medium text-sm">{p.cutter_name}</span>
                    {p.rate_per_view_legacy != null && p.rate_per_view_legacy > 0 && (
                      <span className="text-xs text-muted-foreground/50">
                        (Legacy: €{p.rate_per_view_legacy.toFixed(4)}/View → {eur(p.rate_per_view_legacy * 1000)}/1k)
                      </span>
                    )}
                  </div>
                  <div className="pl-6">
                    <NewProfileRow
                      cutterId={p.cutter_id!}
                      cutterName={p.cutter_name!}
                      onSaved={load}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

      </main>
    </>
  );
}
