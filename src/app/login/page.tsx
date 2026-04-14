"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Scissors, Mail, ArrowRight, CheckCircle, AlertCircle } from "lucide-react";

function LoginForm() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const redirect = searchParams.get("redirect");

  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "sent" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setStatus("loading");
    setErrorMsg("");
    try {
      const res = await fetch("/api/auth/send-magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), redirect }),
      });
      if (res.ok) {
        setStatus("sent");
      } else {
        const data = await res.json();
        setErrorMsg(data.error || "Ein Fehler ist aufgetreten");
        setStatus("error");
      }
    } catch {
      setErrorMsg("Verbindungsfehler. Bitte versuche es erneut.");
      setStatus("error");
    }
  }

  return (
    <div className="w-full max-w-sm">
      {/* Logo + Branding */}
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15 border border-primary/20">
          <Scissors className="h-7 w-7 text-primary" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Cutter Dashboard</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Dein Workspace für Videos, Views und Rechnungen.
        </p>
      </div>

      {/* Error from URL */}
      {error && status === "idle" && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-destructive/20 bg-destructive/8 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error === "invalid_token"
            ? "Dieser Login-Link ist ungültig oder abgelaufen. Fordere einen neuen an."
            : "Ein Fehler ist aufgetreten. Bitte versuche es erneut."}
        </div>
      )}

      {status === "sent" ? (
        /* Success state */
        <div className="rounded-2xl border border-primary/20 bg-card p-7 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/15">
            <CheckCircle className="h-6 w-6 text-primary" />
          </div>
          <h2 className="font-semibold text-base mb-1">E-Mail gesendet!</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Ein Login-Link wurde an{" "}
            <span className="font-medium text-foreground">{email}</span>{" "}
            gesendet. Bitte prüfe dein Postfach und klicke auf den Link.
          </p>
          <p className="mt-3 text-xs text-muted-foreground">
            Kein E-Mail? Prüfe den Spam-Ordner.
          </p>
          <button
            onClick={() => { setStatus("idle"); setEmail(""); }}
            className="mt-5 text-sm text-primary hover:underline"
          >
            Andere E-Mail verwenden
          </button>
        </div>
      ) : (
        /* Login form */
        <form onSubmit={handleSubmit} className="rounded-2xl border border-border bg-card p-6">
          <label htmlFor="email" className="mb-1.5 block text-sm font-medium">
            E-Mail-Adresse
          </label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="deine@email.de"
              required
              autoFocus
              className="h-11 w-full rounded-xl border border-input bg-background pl-10 pr-4 text-sm outline-none transition-all placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>

          {status === "error" && errorMsg && (
            <div className="mt-2 flex items-center gap-1.5 text-sm text-destructive">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              {errorMsg}
            </div>
          )}

          <button
            type="submit"
            disabled={status === "loading" || !email.trim()}
            className="btn-glow mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground transition-all hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {status === "loading" ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground animate-spin" />
                Wird gesendet...
              </span>
            ) : (
              <>
                Magic Link senden
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>

          <p className="mt-4 text-center text-xs text-muted-foreground">
            Du erhältst einen einmaligen Link per E-Mail — kein Passwort nötig.
          </p>
        </form>
      )}
    </div>
  );
}

export default function CutterLoginPage() {
  return (
    <div className="relative flex min-h-screen items-center justify-center p-4 overflow-hidden">
      {/* Subtle background decoration */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 h-80 w-80 rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 h-80 w-80 rounded-full bg-primary/5 blur-3xl" />
      </div>
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}
