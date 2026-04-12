/**
 * GET /api/invoices/[id]/pdf
 * Returns a binary PDF of the invoice — direct download.
 *
 * Query params:
 *   ?inline=1   → Content-Disposition: inline  (view in browser)
 *   (default)   → Content-Disposition: attachment (download)
 */
import { NextRequest, NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { requireCutterAuth, isCutter } from '@/lib/cutter/middleware';
import { ensureDb } from '@/lib/db';
import { InvoicePDF } from '@/lib/cutter/invoice-pdf';
import type { InvoiceTemplateData } from '@/lib/cutter/invoice-template';
import React from 'react';

// Force Node.js runtime — @react-pdf/renderer needs it
export const runtime = 'nodejs';

interface InvoiceRow {
  id: string;
  invoice_number: string;
  period_start: string;
  period_end: string;
  total_views: number;
  total_amount: number;
  rate_per_view: number;
  sender_company: string;
  recipient_company: string;
  created_at: string;
}

interface ItemRow {
  video_title: string;
  video_url: string;
  platform: string;
  views_in_period: number;
  amount: number;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireCutterAuth(request);
  if (!isCutter(auth)) return auth;

  const { id } = await params;
  const db = await ensureDb();

  const invoiceResult = await db.execute({
    sql: `SELECT * FROM cutter_invoices WHERE id = ? AND cutter_id = ?`,
    args: [id, auth.id],
  });
  const invoice = invoiceResult.rows[0] as unknown as InvoiceRow | undefined;

  if (!invoice) {
    return NextResponse.json({ error: 'Rechnung nicht gefunden' }, { status: 404 });
  }

  const itemsResult = await db.execute({
    sql: `SELECT * FROM cutter_invoice_items WHERE invoice_id = ? ORDER BY views_in_period DESC`,
    args: [id],
  });
  const items = itemsResult.rows as unknown as ItemRow[];

  const sender    = JSON.parse(invoice.sender_company    || '{}');
  const recipient = JSON.parse(invoice.recipient_company || '{}');

  const templateData: InvoiceTemplateData = {
    invoiceNumber: invoice.invoice_number,
    invoiceDate:   formatDate(invoice.created_at),
    periodStart:   formatDate(invoice.period_start),
    periodEnd:     formatDate(invoice.period_end),
    sender: {
      name:    sender.name    || auth.name,
      company: sender.name,
      address: sender.address,
      taxId:   sender.taxId,
      iban:    sender.iban,
    },
    recipient: {
      name:    recipient.name    || '',
      address: recipient.address,
      taxId:   recipient.taxId,
    },
    items: items.map((item, i) => ({
      position:   i + 1,
      title:      item.video_title,
      platform:   item.platform,
      url:        item.video_url,
      views:      item.views_in_period,
      ratePerView: invoice.rate_per_view,
      amount:     item.amount,
    })),
    totalViews:  invoice.total_views,
    totalAmount: invoice.total_amount,
    ratePerView: invoice.rate_per_view,
  };

  // Render PDF to buffer
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfBuffer = await renderToBuffer(
    React.createElement(InvoicePDF, { data: templateData }) as any
  );

  const filename = `${invoice.invoice_number}.pdf`;
  const inline   = request.nextUrl.searchParams.get('inline') === '1';
  const disposition = inline
    ? `inline; filename="${filename}"`
    : `attachment; filename="${filename}"`;

  // Convert Buffer → Uint8Array for NextResponse compatibility
  const body = new Uint8Array(pdfBuffer);

  return new NextResponse(body, {
    headers: {
      'Content-Type':        'application/pdf',
      'Content-Disposition': disposition,
      'Content-Length':      String(body.byteLength),
      'Cache-Control':       'private, no-cache',
    },
  });
}
