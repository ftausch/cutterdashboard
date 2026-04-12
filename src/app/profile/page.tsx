"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CutterNav } from "@/components/cutter-nav";
import {
  Save, CheckCircle, User, Building2, CreditCard,
  AlertCircle, Euro, ShieldCheck, FileText,
} from "lucide-react";

interface Profile {
  name: string;
  email: string;
  company_name: string;
  company_address: string;
  tax_id: string;
  iban: string;
  rate_per_view: number;
  reliability_score?: {
    score: number;
    total_videos: number;
    verified_count: number;
    last_calculated_at: string;
  } | null;
}

// ── Helpers ───────────────────────────────────────────────────────
function formatIban(raw: string): string {
  return raw.replace(/\s/g, "").replace(/(.{4})/g, "$1 ").trim().toUpperCase();
}

function completionFields(p: Profile) {
  return [
    { key: "name",            label: "Name",            done: !!p.name },
    { key: "company_name",    label: "Firma / Name",    done: !!p.company_name },
    { key: "company_address", label: "Adresse",         done: !!p.company_address },
    { key: "tax_id",          label: "Steuernummer",    done: !!p.tax_id },
    { key: "iban",            label: "IBAN",            done: !!p.iban },
  ];
}

// ── Field ─────────────────────────────────────────────────────────
function Field({
  label, value, onChange, disabled, placeholder, hint, type = "text",
}: {
  label: string; value: string; onChange?: (v: string) => void;
  disabled?: boolean; placeholder?: string; hint?: string; type?: string;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-40 disabled:cursor-not-allowed"
      />
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

// ── Score bar ─────────────────────────────────────────────────────
function ScoreBar({ value, max, color }: { value: number; max: number; color: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/40">
      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${Math.min(100, (value / max) * 100)}%` }} />
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────
export default function CutterProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => { if (r.status === 401) { router.push("/login"); return null; } return r.json(); })
      .then((d) => d && setProfile(d));
  }, [router]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setSaving(true); setSaved(false); setError(null);
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name:            profile.name,
        company_name:    profile.company_name,
        company_address: profile.company_address,
        tax_id:          profile.tax_id,
        iban:            profile.iban.replace(/\s/g, ""),
      }),
    });
    setSaving(false);
    if (res.ok) { setSaved(true); setTimeout(() => setSaved(false), 3000); }
    else { const d = await res.json(); setError(d.error || "Speichern fehlgeschlagen"); }
  }

  if (!profile) {
    return (
      <>
        <CutterNav />
        <main className="mx-auto max-w-2xl p-6 space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-5">
              <div className="skeleton h-4 w-32 mb-4" />
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="skeleton h-10 w-full" />
                <div className="skeleton h-10 w-full" />
              </div>
            </div>
          ))}
        </main>
      </>
    );
  }

  const fields   = completionFields(profile);
  const doneCnt  = fields.filter((f) => f.done).length;
  const pct      = Math.round((doneCnt / fields.length) * 100);
  const complete = doneCnt === fields.length;

  const score    = profile.reliability_score;

  return (
    <>
      <CutterNav />
      <main className="mx-auto max-w-2xl p-6">

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">Profil & Rechnungsdaten</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Deine Angaben erscheinen als Absender auf allen Rechnungen.
          </p>
        </div>

        {/* Completion banner */}
        {!complete && (
          <div className="mb-5 rounded-xl border border-amber-500/30 bg-amber-500/8 p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-amber-400 mb-1">
                  Profil unvollständig — Rechnungen können nicht erstellt werden
                </p>
                <p className="text-xs text-amber-400/70 mb-3">
                  Fülle alle Felder aus damit deine Rechnungen korrekt ausgestellt werden können.
                </p>
                {/* Progress */}
                <div className="flex items-center gap-2 mb-2">
                  <div className="flex-1 h-1.5 rounded-full bg-amber-500/20 overflow-hidden">
                    <div className="h-full rounded-full bg-amber-400 transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs text-amber-400 font-medium">{doneCnt}/{fields.length}</span>
                </div>
                {/* Missing fields */}
                <div className="flex flex-wrap gap-1.5">
                  {fields.filter((f) => !f.done).map((f) => (
                    <span key={f.key} className="rounded-md bg-amber-500/15 px-2 py-0.5 text-xs text-amber-400">
                      {f.label} fehlt
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {complete && (
          <div className="mb-5 flex items-center gap-2.5 rounded-xl border border-emerald-500/25 bg-emerald-500/8 px-4 py-3">
            <CheckCircle className="h-4 w-4 text-emerald-400 shrink-0" />
            <p className="text-sm text-emerald-400 font-medium">Profil vollständig — Rechnungen können erstellt werden.</p>
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-4">

          {/* Personal */}
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <User className="h-4 w-4 text-muted-foreground" />
              <h2 className="font-semibold text-sm">Persönliche Daten</h2>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Name"
                value={profile.name}
                onChange={(v) => setProfile({ ...profile, name: v })}
                placeholder="Max Mustermann"
              />
              <Field
                label="E-Mail"
                value={profile.email}
                disabled
                hint="E-Mail kann nicht geändert werden."
              />
            </div>
          </div>

          {/* Invoice data */}
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center gap-2 mb-1">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <h2 className="font-semibold text-sm">Rechnungsdaten</h2>
            </div>
            <p className="text-xs text-muted-foreground mb-4 ml-6">
              Erscheinen als Absender auf deinen Rechnungen.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Firma / Name (Rechnungsabsender)"
                value={profile.company_name || ""}
                onChange={(v) => setProfile({ ...profile, company_name: v })}
                placeholder="Max Mustermann Medienproduktion"
              />
              <Field
                label="Steuernummer / USt-IdNr."
                value={profile.tax_id || ""}
                onChange={(v) => setProfile({ ...profile, tax_id: v })}
                placeholder="12/345/67890"
                hint="Wird auf der Rechnung ausgewiesen."
              />
            </div>
            <div className="mt-4">
              <Field
                label="Adresse (Straße, PLZ, Stadt)"
                value={profile.company_address || ""}
                onChange={(v) => setProfile({ ...profile, company_address: v })}
                placeholder="Musterstraße 1, 12345 Musterstadt"
              />
            </div>
          </div>

          {/* IBAN */}
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center gap-2 mb-1">
              <CreditCard className="h-4 w-4 text-muted-foreground" />
              <h2 className="font-semibold text-sm">Zahlungsdaten</h2>
            </div>
            <p className="text-xs text-muted-foreground mb-4 ml-6">
              Deine IBAN erscheint im Zahlungsbereich jeder Rechnung.
            </p>
            <Field
              label="IBAN"
              value={formatIban(profile.iban || "")}
              onChange={(v) => setProfile({ ...profile, iban: v.replace(/\s/g, "") })}
              placeholder="DE89 3704 0044 0532 0130 00"
              hint="Wird automatisch formatiert."
            />
          </div>

          {/* Rate (read-only) */}
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center gap-2 mb-3">
              <Euro className="h-4 w-4 text-muted-foreground" />
              <h2 className="font-semibold text-sm">Vergütung</h2>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-muted/30 px-4 py-3">
              <div>
                <p className="text-xs text-muted-foreground">Rate pro View</p>
                <p className="text-lg font-bold">
                  {new Intl.NumberFormat("de-DE", {
                    style: "currency", currency: "EUR", minimumFractionDigits: 4,
                  }).format(profile.rate_per_view)}
                </p>
              </div>
              <p className="text-xs text-muted-foreground max-w-[180px] text-right">
                Wird vom Admin festgelegt und kann nicht selbst geändert werden.
              </p>
            </div>
          </div>

          {/* Invoice preview */}
          {complete && (
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="flex items-center gap-2 mb-4">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <h2 className="font-semibold text-sm">Rechnungs-Vorschau</h2>
                <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">So siehst du auf Rechnungen aus</span>
              </div>
              <div className="rounded-lg border border-dashed border-border bg-background/50 p-4 font-mono text-xs space-y-0.5">
                <p className="font-bold text-sm not-italic">{profile.company_name || profile.name}</p>
                {profile.company_address && <p className="text-muted-foreground">{profile.company_address}</p>}
                {profile.tax_id && <p className="text-muted-foreground">USt-IdNr.: {profile.tax_id}</p>}
                <div className="pt-2 border-t border-border/50 mt-2">
                  {profile.iban && <p className="text-muted-foreground">IBAN: {formatIban(profile.iban)}</p>}
                  <p className="text-muted-foreground">Kontoinhaber: {profile.company_name || profile.name}</p>
                </div>
              </div>
            </div>
          )}

          {/* Reliability */}
          {score != null && (
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="flex items-center gap-2 mb-4">
                <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                <h2 className="font-semibold text-sm">Zuverlässigkeits-Score</h2>
              </div>
              <div className="flex items-center gap-5">
                <div className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-2xl font-black ${
                  score.score >= 80 ? "bg-emerald-500/10 text-emerald-400" :
                  score.score >= 50 ? "bg-yellow-500/10 text-yellow-400" :
                  "bg-red-500/10 text-red-400"
                }`}>
                  {score.score}
                </div>
                <div className="flex-1 min-w-0">
                  <ScoreBar
                    value={score.score} max={100}
                    color={score.score >= 80 ? "bg-emerald-500" : score.score >= 50 ? "bg-yellow-500" : "bg-red-500"}
                  />
                  <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
                    <span>{score.verified_count} / {score.total_videos} Videos verifiziert</span>
                    <span>·</span>
                    <span>
                      Zuletzt {new Date(score.last_calculated_at).toLocaleDateString("de-DE")}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/8 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          {/* Save button */}
          <div className="flex items-center justify-between pt-1">
            <p className="text-xs text-muted-foreground">
              {complete ? "Alle Pflichtfelder ausgefüllt ✓" : `Noch ${fields.length - doneCnt} Feld${fields.length - doneCnt !== 1 ? "er" : ""} ausstehend`}
            </p>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {saved ? (
                <><CheckCircle className="h-4 w-4" /> Gespeichert</>
              ) : saving ? (
                "Wird gespeichert…"
              ) : (
                <><Save className="h-4 w-4" /> Speichern</>
              )}
            </button>
          </div>
        </form>
      </main>
    </>
  );
}
