/**
 * GET  /api/insights/:id/proofs — list proofs
 * POST /api/insights/:id/proofs — upload a screenshot
 */
import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, isCutter } from '@/lib/cutter/middleware';
import { uploadProof, buildStoragePath, getSignedUrl } from '@/lib/storage';
import { randomUUID } from 'crypto';

async function dbQuery(sql: string, args: unknown[] = []) {
  const url   = process.env.TURSO_DATABASE_URL!.replace('libsql://', 'https://');
  const token = process.env.TURSO_AUTH_TOKEN!;
  const res   = await fetch(`${url}/v2/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requests: [{
        type: 'execute',
        stmt: {
          sql,
          args: args.map(a =>
            a === null            ? { type: 'null' } :
            typeof a === 'number' ? { type: 'integer', value: String(Math.round(a)) } :
            { type: 'text', value: String(a) }
          ),
        },
      }, { type: 'close' }],
    }),
  });
  const data = await res.json();
  const r    = data.results?.[0];
  if (r?.type === 'error') throw new Error(r.error.message);
  return r?.response?.result ?? { rows: [], cols: [] };
}

function val(c: unknown): string | null {
  if (c == null) return null;
  return (c as { value: string | null }).value ?? null;
}
function num(c: unknown): number | null {
  const v = val(c); if (!v) return null;
  const n = parseFloat(v); return isNaN(n) ? null : n;
}

async function checkOwnership(reportId: string, cutterId: string) {
  const res = await dbQuery(
    `SELECT status FROM monthly_insight_reports WHERE id = ? AND cutter_id = ?`,
    [reportId, cutterId]
  );
  if (!res.rows.length) return null;
  return val((res.rows[0] as unknown[])[0]);
}

// ── GET ───────────────────────────────────────────────────────────────────
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(request, 'PROOF_UPLOAD');
  if (!isCutter(auth)) return auth;

  const { id } = await params;
  if (!await checkOwnership(id, auth.id)) {
    return NextResponse.json({ error: 'Bericht nicht gefunden.' }, { status: 404 });
  }

  const res = await dbQuery(
    `SELECT id, storage_path, file_name, file_size, mime_type, description, uploaded_at
     FROM monthly_insight_proofs WHERE report_id = ? ORDER BY uploaded_at DESC`,
    [id]
  );

  const proofs = await Promise.all(
    (res.rows as unknown[][]).map(async f => {
      const path = val(f[1]);
      let signed_url: string | null = null;
      if (path) { try { signed_url = await getSignedUrl(path); } catch { signed_url = null; } }
      return {
        id: val(f[0]), signed_url,
        file_name: val(f[2]), file_size: num(f[3]),
        mime_type: val(f[4]), description: val(f[5]), uploaded_at: val(f[6]),
      };
    })
  );

  return NextResponse.json({ proofs });
}

// ── POST ──────────────────────────────────────────────────────────────────
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(request, 'PROOF_UPLOAD');
  if (!isCutter(auth)) return auth;

  const { id } = await params;
  const status = await checkOwnership(id, auth.id);
  if (!status) {
    return NextResponse.json({ error: 'Bericht nicht gefunden.' }, { status: 404 });
  }
  if (status === 'approved') {
    return NextResponse.json({ error: 'Genehmigte Berichte können nicht bearbeitet werden.' }, { status: 400 });
  }

  // Max 10 proofs per report
  const countRes = await dbQuery(
    `SELECT COUNT(*) FROM monthly_insight_proofs WHERE report_id = ?`, [id]
  );
  const existing = num((countRes.rows[0] as unknown[])[0]) ?? 0;
  if (existing >= 10) {
    return NextResponse.json({ error: 'Maximal 10 Screenshots pro Bericht.' }, { status: 400 });
  }

  const formData    = await request.formData();
  const file        = formData.get('file') as File | null;
  const description = formData.get('description') as string | null;

  if (!file) return NextResponse.json({ error: 'Keine Datei.' }, { status: 400 });

  const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  if (!ALLOWED.includes(file.type)) {
    return NextResponse.json({ error: 'Nur JPEG, PNG, WebP und GIF erlaubt.' }, { status: 400 });
  }
  if (file.size > 15 * 1024 * 1024) {
    return NextResponse.json({ error: 'Maximal 15 MB pro Screenshot.' }, { status: 400 });
  }

  const proofId     = randomUUID();
  const storagePath = buildStoragePath(`insights/${id}`, file.name, file.type);
  const buffer      = await file.arrayBuffer();

  await uploadProof(storagePath, buffer, file.type);

  const now = new Date().toISOString();
  await dbQuery(
    `INSERT INTO monthly_insight_proofs
       (id, report_id, cutter_id, storage_path, file_name, file_size, mime_type, description, uploaded_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [proofId, id, auth.id, storagePath, file.name, file.size, file.type, description ?? null, now]
  );

  // Auto-transition from draft → draft (stays draft until submit)
  await dbQuery(
    `UPDATE monthly_insight_reports SET updated_at = ? WHERE id = ?`, [now, id]
  );

  const signed_url = await getSignedUrl(storagePath);

  return NextResponse.json({
    id: proofId, signed_url,
    file_name: file.name, file_size: file.size,
    mime_type: file.type, description, uploaded_at: now,
  }, { status: 201 });
}
