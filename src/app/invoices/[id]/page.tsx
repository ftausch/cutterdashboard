"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { CutterNav } from "@/components/cutter-nav";
import { ArrowLeft, FileText, Download, ExternalLink } from "lucide-react";

interface Invoice {
  id: string;
  invoice_number: string;
  period_start: string;
  period_end: string;
  total_views: number;
  total_amount: number;
  rate_per_view: number;
  status: string;
  sender_company: string;
  recipient_company: string;
  created_at: string;
}

interface InvoiceItem {
  id: string;
  video_title: string;
  video_url: string;
  platform: string;
  views_in_period: number;
  amount: number;
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

const PLATFORM_LABELS: Record<string, string> = {
  youtube: "YouTube",
  tiktok: "TikTok",
  instagram: "Instagram",
  facebook: "Facebook",
};

const PLATFORM_COLORS: Record<string, string> = {
  youtube: "bg-red-500/10 text-red-400",
  tiktok: "bg-cyan-500/10 text-cyan-400",
  instagram: "bg-pink-500/10 text-pink-400",
  facebook: "bg-blue-500/10 text-blue-400",
};

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  draft: { label: "Entwurf", color: "bg-yellow-500/10 text-yellow-400" },
  sent: { label: "Gesendet", color: "bg-blue-500/10 text-blue-400" },
  paid: { label: "Bezahlt", color: "bg-emerald-500/10 text-emerald-400" },
};

export default function InvoiceDetailPage() {
  const router = useRouter();
  const params = useParams();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [items, setItems] = useState<InvoiceItem[]>([]);

  useEffect(() => {
    if (!params.id) return;
    fetch(`/api/invoices/${params.id}`)
      .then((r) => {
        if (r.status === 401) { router.push("/login"); return null; }
        if (!r.ok) { router.push("/invoices"); return null; }
        return r.json();
      })
      .then((data) => {
        if (data) {
          setInvoice(data.invoice);
          setItems(data.items);
        }
      });
  }, [params.id, router]);

  if (!invoice) {
    return (
      <>
        <CutterNav />
        <main className="p-6"><p>Laden...</p></main>
      </>
    );
  }

  const status = STATUS_MAP[invoice.status] || STATUS_MAP.draft;

  return (
    <>
      <CutterNav />
      <main className="mx-auto max-w-4xl p-6">
        <Link
          href="/invoices"
          className="mb-4 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Alle Rechnungen
        </Link>

        {/* Header */}
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold">{invoice.invoice_number}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Erstellt am {formatDate(invoice.created_at)} &middot; Zeitraum{" "}
              {formatDate(invoice.period_start)} – {formatDate(invoice.period_end)}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className={`rounded px-2.5 py-1 text-xs font-medium ${status.color}`}>
              {status.label}
            </span>
            <a
              href={`/api/invoices/${invoice.id}/pdf?inline=1`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3.5 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <FileText className="h-4 w-4" />
              Anzeigen
            </a>
            <a
              href={`/api/invoices/${invoice.id}/pdf`}
              download
              className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
            >
              <Download className="h-4 w-4" />
              PDF herunterladen
            </a>
          </div>
        </div>

        {/* Summary */}
        <div className="mb-6 grid grid-cols-3 gap-4">
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">Views</p>
            <p className="text-xl font-bold">{formatNum(invoice.total_views)}</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">Preis/View</p>
            <p className="text-xl font-bold">
              {new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", minimumFractionDigits: 4 }).format(invoice.rate_per_view)}
            </p>
          </div>
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
            <p className="text-xs text-muted-foreground">Gesamtbetrag</p>
            <p className="text-xl font-bold text-emerald-400">{formatEur(invoice.total_amount)}</p>
          </div>
        </div>

        {/* Line Items */}
        <div className="rounded-xl border border-border bg-card">
          <div className="border-b border-border px-5 py-3">
            <h2 className="font-semibold">Positionen ({items.length})</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-4 py-3 font-medium w-12">#</th>
                  <th className="px-4 py-3 font-medium">Video</th>
                  <th className="px-4 py-3 font-medium">Plattform</th>
                  <th className="px-4 py-3 font-medium text-right">Views</th>
                  <th className="px-4 py-3 font-medium text-right">Betrag</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.map((item, i) => (
                  <tr key={item.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3 text-muted-foreground">{i + 1}</td>
                    <td className="max-w-sm px-4 py-3">
                      <p className="truncate font-medium">{item.video_title}</p>
                      <a
                        href={item.video_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 truncate text-xs text-muted-foreground hover:text-primary"
                      >
                        {item.video_url}
                        <ExternalLink className="h-3 w-3 shrink-0" />
                      </a>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-medium ${PLATFORM_COLORS[item.platform] || "bg-muted"}`}
                      >
                        {PLATFORM_LABELS[item.platform] || item.platform}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">{formatNum(item.views_in_period)}</td>
                    <td className="px-4 py-3 text-right font-medium">{formatEur(item.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </>
  );
}
