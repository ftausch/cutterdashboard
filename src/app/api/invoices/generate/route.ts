import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { requireCutterAuth, isCutter } from '@/lib/cutter/middleware';
import { ensureDb } from '@/lib/db';
import { writeAuditLog } from '@/lib/audit';

interface VideoRow {
  id: string;
  platform: string;
  url: string;
  title: string | null;
  current_views: number;
  views_at_last_invoice: number;
}

interface SettingRow {
  key: string;
  value: string;
}

const TEST_VIEWS_PER_VIDEO = 10_000;

export async function POST(request: NextRequest) {
  const auth = await requireCutterAuth(request);
  if (!isCutter(auth)) return auth;

  const isTest = new URL(request.url).searchParams.get('test') === '1';
  const db     = await ensureDb();
  const year   = new Date().getFullYear();
  const prefix = `RE-${year}-`;

  // ── Round 2: all read-queries in parallel ──────────────────────
  const [videosResult, lastInvoiceResult, invoiceCountResult, settingsResult] =
    await Promise.all([
      // All cutter videos
      db.execute({
        sql: `SELECT id, platform, url, title, current_views, views_at_last_invoice
              FROM cutter_videos WHERE cutter_id = ?`,
        args: [auth.id],
      }),
      // Last invoice for period calculation
      db.execute({
        sql: `SELECT period_end FROM cutter_invoices
              WHERE cutter_id = ? ORDER BY created_at DESC LIMIT 1`,
        args: [auth.id],
      }),
      // Invoice count for sequential number generation
      db.execute({
        sql: `SELECT invoice_number FROM cutter_invoices
              WHERE invoice_number LIKE ? || '%'
              ORDER BY invoice_number DESC LIMIT 1`,
        args: [prefix],
      }),
      // Recipient company settings
      db.execute(
        `SELECT key, value FROM cutter_settings WHERE key LIKE 'recipient_%'`
      ),
    ]);

  // ── Process results ────────────────────────────────────────────
  const videos = videosResult.rows as unknown as VideoRow[];

  const DUMMY_VIDEO: VideoRow = {
    id: 'test-dummy',
    platform: 'youtube',
    url: 'https://youtube.com/watch?v=test',
    title: 'Test Video',
    current_views: TEST_VIEWS_PER_VIDEO,
    views_at_last_invoice: 0,
  };

  const billableItems = isTest
    ? (videos.length > 0 ? videos : [DUMMY_VIDEO]).map((v) => ({
        video: v,
        deltaViews: TEST_VIEWS_PER_VIDEO,
        amount: TEST_VIEWS_PER_VIDEO * auth.rate_per_view,
      }))
    : videos
        .filter((v) => v.current_views > v.views_at_last_invoice)
        .map((v) => ({
          video: v,
          deltaViews: v.current_views - v.views_at_last_invoice,
          amount: (v.current_views - v.views_at_last_invoice) * auth.rate_per_view,
        }));

  if (billableItems.length === 0) {
    return NextResponse.json({ error: 'Keine abrechenbaren Views vorhanden.' }, { status: 400 });
  }

  const totalViews  = billableItems.reduce((s, i) => s + i.deltaViews, 0);
  const totalAmount = billableItems.reduce((s, i) => s + i.amount, 0);

  // Sequential invoice number
  const lastRow = invoiceCountResult.rows[0] as { invoice_number: string } | undefined;
  let counter = 1;
  if (lastRow) {
    const num = parseInt(lastRow.invoice_number.replace(prefix, '').replace('TEST-', ''), 10);
    if (!isNaN(num)) counter = num + 1;
  }
  const baseNumber    = `${prefix}${String(counter).padStart(3, '0')}`;
  const invoiceNumber = isTest ? `TEST-${baseNumber}` : baseNumber;

  // Period
  const lastInvoice = lastInvoiceResult.rows[0] as { period_end: string } | undefined;
  const periodStart = lastInvoice?.period_end || auth.created_at;
  const periodEnd   = new Date().toISOString();

  // Company info
  const settings    = settingsResult.rows as unknown as SettingRow[];
  const settingsMap = Object.fromEntries(settings.map((s) => [s.key, s.value]));

  const recipientCompany = JSON.stringify({
    name:    settingsMap['recipient_company_name']    || '',
    address: settingsMap['recipient_company_address'] || '',
    taxId:   settingsMap['recipient_tax_id']          || '',
  });
  const senderCompany = JSON.stringify({
    name:    auth.company_name    || auth.name,
    address: auth.company_address || '',
    taxId:   auth.tax_id          || '',
    iban:    auth.iban            || '',
  });

  // ── Round 3: transaction ───────────────────────────────────────
  const invoiceId = randomUUID();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stmts: Array<{ sql: string; args?: any[] }> = [
    {
      sql: `INSERT INTO cutter_invoices
              (id, cutter_id, invoice_number, period_start, period_end,
               total_views, total_amount, rate_per_view, status,
               recipient_company, sender_company)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)`,
      args: [
        invoiceId, auth.id, invoiceNumber, periodStart, periodEnd,
        totalViews, totalAmount, auth.rate_per_view,
        recipientCompany, senderCompany,
      ],
    },
    ...billableItems.map((item) => ({
      sql: `INSERT INTO cutter_invoice_items
              (id, invoice_id, video_id, video_title, video_url, platform, views_in_period, amount)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        randomUUID(), invoiceId, item.video.id,
        item.video.title || 'Video', item.video.url, item.video.platform,
        item.deltaViews, item.amount,
      ],
    })),
    ...(!isTest ? [{
      sql: `UPDATE cutter_videos SET views_at_last_invoice = current_views WHERE cutter_id = ?`,
      args: [auth.id],
    }] : []),
  ];

  // Run transaction + audit log in parallel (audit is non-blocking)
  await db.transaction(stmts);

  // Fire-and-forget audit log — don't block the response
  writeAuditLog(db, {
    actorId:    auth.id,
    actorName:  auth.name,
    action:     'invoice_generate',
    entityType: 'invoice',
    entityId:   invoiceId,
    meta: { invoice_number: invoiceNumber, total_views: totalViews, total_amount: totalAmount, items_count: billableItems.length },
  }).catch((err) => console.error('[audit]', err));

  return NextResponse.json({
    invoice: {
      id:           invoiceId,
      invoice_number: invoiceNumber,
      period_start: periodStart,
      period_end:   periodEnd,
      total_views:  totalViews,
      total_amount: totalAmount,
      rate_per_view: auth.rate_per_view,
      status:       'draft',
      items_count:  billableItems.length,
    },
  });
}
