"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CutterNav } from "@/components/cutter-nav";
import { Receipt, Plus, FileText, FlaskConical } from "lucide-react";

interface Invoice {
  id: string;
  invoice_number: string;
  period_start: string;
  period_end: string;
  total_views: number;
  total_amount: number;
  rate_per_view: number;
  status: string;
  created_at: string;
}

function formatNum(n: number): string {
  return new Intl.NumberFormat("de-DE").format(n);
}

function formatEur(n: number): string {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("de-DE");
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  draft: { label: "Entwurf", color: "bg-yellow-500/10 text-yellow-400" },
  sent: { label: "Gesendet", color: "bg-blue-500/10 text-blue-400" },
  paid: { label: "Bezahlt", color: "bg-emerald-500/10 text-emerald-400" },
};

export default function CutterInvoicesPage() {
  const router = useRouter();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [generating, setGenerating] = useState(false);
  const [generatingTest, setGeneratingTest] = useState(false);

  function loadInvoices() {
    fetch("/api/invoices")
      .then((r) => {
        if (r.status === 401) { router.push("/login"); return null; }
        return r.json();
      })
      .then((data) => data?.invoices && setInvoices(data.invoices));
  }

  useEffect(() => { loadInvoices(); }, [router]);

  async function handleGenerate() {
    if (!confirm("Rechnung generieren? Alle aktuellen Views werden als abgerechnet markiert.")) return;

    setGenerating(true);
    const res = await fetch("/api/invoices/generate", { method: "POST" });
    const data = await res.json();
    setGenerating(false);

    if (res.ok) {
      loadInvoices();
      router.push(`/invoices/${data.invoice.id}`);
    } else {
      alert(data.error || "Fehler bei der Rechnungserstellung");
    }
  }

  async function handleTestGenerate() {
    if (!confirm("Test-Rechnung generieren? Nutzt fiktive Views (10.000 pro Video) — echte Daten werden NICHT verändert.")) return;

    setGeneratingTest(true);
    const res = await fetch("/api/invoices/generate?test=1", { method: "POST" });
    const data = await res.json();
    setGeneratingTest(false);

    if (res.ok) {
      loadInvoices();
      router.push(`/invoices/${data.invoice.id}`);
    } else {
      alert(data.error || "Fehler bei der Test-Rechnungserstellung");
    }
  }

  return (
    <>
      <CutterNav />
      <main className="mx-auto max-w-4xl p-6">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold">Rechnungen</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={handleTestGenerate}
              disabled={generatingTest || generating}
              title="Generiert eine Testrechnung mit fiktiven Views — echte Daten bleiben unverändert"
              className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3.5 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
            >
              <FlaskConical className="h-4 w-4" />
              {generatingTest ? "Wird erstellt..." : "Test-Rechnung"}
            </button>
            <button
              onClick={handleGenerate}
              disabled={generating || generatingTest}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              {generating ? "Wird erstellt..." : "Rechnung generieren"}
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card">
          {invoices.length === 0 ? (
            <div className="flex flex-col items-center gap-3 p-12 text-center">
              <Receipt className="h-10 w-10 text-muted-foreground" />
              <p className="text-muted-foreground">Noch keine Rechnungen erstellt.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Nr.</th>
                    <th className="px-4 py-3 font-medium">Zeitraum</th>
                    <th className="px-4 py-3 font-medium text-right">Views</th>
                    <th className="px-4 py-3 font-medium text-right">Betrag</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Erstellt</th>
                    <th className="px-4 py-3 font-medium w-16"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {invoices.map((inv) => {
                    const s = STATUS_LABELS[inv.status] || STATUS_LABELS.draft;
                    return (
                      <tr key={inv.id} className="hover:bg-muted/30">
                        <td className="px-4 py-3 font-medium">
                          <div className="flex items-center gap-2">
                            <Link
                              href={`/invoices/${inv.id}`}
                              className="hover:text-primary hover:underline"
                            >
                              {inv.invoice_number}
                            </Link>
                            {inv.invoice_number.startsWith("TEST-") && (
                              <span className="rounded px-1.5 py-0.5 text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                TEST
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {formatDate(inv.period_start)} – {formatDate(inv.period_end)}
                        </td>
                        <td className="px-4 py-3 text-right">{formatNum(inv.total_views)}</td>
                        <td className="px-4 py-3 text-right font-medium">{formatEur(inv.total_amount)}</td>
                        <td className="px-4 py-3">
                          <span className={`rounded px-2 py-0.5 text-xs font-medium ${s.color}`}>
                            {s.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{formatDate(inv.created_at)}</td>
                        <td className="px-4 py-3">
                          <a
                            href={`/api/invoices/${inv.id}/pdf`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                            title="PDF öffnen"
                          >
                            <FileText className="h-4 w-4" />
                          </a>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
