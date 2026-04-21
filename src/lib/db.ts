// Direct Turso HTTP API client — no @libsql/client, no cold start issues
//
// IMPORTANT — Turso /v2/pipeline wire format:
//   Every arg value MUST be a JSON string, regardless of the declared type.
//   { type: 'integer', value: 42 }   ← WRONG (Turso rejects with "expected a borrowed string")
//   { type: 'integer', value: "42" } ← CORRECT
//   { type: 'null' }                 ← no value field for NULL
//
// This is why all mapArg() calls use String(v) — never pass a raw number.

const TURSO_URL = (process.env.TURSO_DATABASE_URL || '')
  .trim()
  .replace('libsql://', 'https://');
const TURSO_TOKEN = (process.env.TURSO_AUTH_TOKEN || '').trim();

export type SqlValue = string | number | boolean | null;

interface TursoRow {
  [key: string]: SqlValue;
}

interface TursoResult {
  rows: TursoRow[];
  affected_row_count: number;
}

/** Map a JS value to the Turso wire-format arg object. value is always a string. */
function mapArg(v: SqlValue): { type: string; value?: string } {
  if (v === null)             return { type: 'null' };
  if (typeof v === 'boolean') return { type: 'integer', value: v ? '1' : '0' };
  if (typeof v === 'number')  return { type: Number.isInteger(v) ? 'integer' : 'float', value: String(v) };
  return { type: 'text', value: String(v) };
}

async function tursoExecute(sql: string, args: SqlValue[] = []): Promise<TursoResult> {
  const mappedArgs = args.map(mapArg);

  console.debug('[db.execute] SQL:', sql.slice(0, 120));
  console.debug('[db.execute] args (raw):', args);
  console.debug('[db.execute] args (mapped):', JSON.stringify(mappedArgs));

  const res = await fetch(`${TURSO_URL}/v2/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TURSO_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      requests: [
        { type: 'execute', stmt: { sql, args: mappedArgs } },
        { type: 'close' },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error('[db.execute] Turso HTTP error:', res.status, body);
    throw new Error(`Turso HTTP error: ${res.status} ${body}`);
  }

  const data = await res.json();
  const result = data.results[0];

  if (result.type === 'error') {
    console.error('[db.execute] Turso SQL error:', result.error.message, '| SQL:', sql);
    throw new Error(`Turso SQL error: ${result.error.message}`);
  }

  const { cols, rows } = result.response.result;
  const mappedRows: TursoRow[] = rows.map((row: any[]) =>
    Object.fromEntries(cols.map((col: { name: string }, i: number) => {
      const cell = row[i];
      const val = cell?.type === 'null' || cell === null ? null : cell?.value ?? null;
      // Convert numeric strings back to JS numbers for integer/float columns
      if (cell?.type === 'integer') return [col.name, val !== null ? parseInt(val, 10) : null];
      if (cell?.type === 'float')   return [col.name, val !== null ? parseFloat(val)  : null];
      return [col.name, val];
    }))
  );

  return {
    rows: mappedRows,
    affected_row_count: result.response.result.affected_row_count ?? 0,
  };
}

// Transaction helper — runs multiple statements sequentially, rolls back on error
async function tursoTransaction(
  stmts: Array<{ sql: string; args?: SqlValue[] }>
): Promise<TursoResult[]> {
  const requests = [
    { type: 'execute', stmt: { sql: 'BEGIN' } },
    ...stmts.map((s) => ({
      type: 'execute',
      stmt: {
        sql: s.sql,
        args: (s.args ?? []).map(mapArg),  // ← uses shared mapArg, value always a string
      },
    })),
    { type: 'execute', stmt: { sql: 'COMMIT' } },
    { type: 'close' },
  ];

  const res = await fetch(`${TURSO_URL}/v2/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TURSO_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ requests }),
  });

  if (!res.ok) throw new Error(`Turso HTTP error: ${res.status}`);

  const data = await res.json();
  const results = data.results;

  // Check for errors in the statement results (skip BEGIN at [0] and COMMIT/-2, CLOSE/-1)
  for (let i = 1; i < results.length - 2; i++) {
    if (results[i].type === 'error') {
      // Try to rollback
      await fetch(`${TURSO_URL}/v2/pipeline`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${TURSO_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ requests: [{ type: 'execute', stmt: { sql: 'ROLLBACK' } }, { type: 'close' }] }),
      }).catch(() => {});
      throw new Error(`Turso SQL error in transaction: ${results[i].error.message}`);
    }
  }

  const { cols } = results[1]?.response?.result ?? { cols: [] };
  return results.slice(1, -2).map((r: any) => {
    if (r.type === 'error') throw new Error(r.error.message);
    const res = r.response.result;
    const rows: TursoRow[] = (res.rows ?? []).map((row: any[]) =>
      Object.fromEntries((res.cols ?? cols).map((col: { name: string }, i: number) => {
        const cell = row[i];
        const val = cell?.type === 'null' || cell === null ? null : cell?.value ?? null;
        if (cell?.type === 'integer') return [col.name, val !== null ? parseInt(val, 10) : null];
        if (cell?.type === 'float')   return [col.name, val !== null ? parseFloat(val)  : null];
        return [col.name, val];
      }))
    );
    return { rows, affected_row_count: res.affected_row_count ?? 0 };
  });
}

// ── Public DB interface ────────────────────────────────────────────

export interface DbClient {
  execute(query: string | { sql: string; args?: SqlValue[] }): Promise<TursoResult>;
  transaction(stmts: Array<{ sql: string; args?: SqlValue[] }>): Promise<TursoResult[]>;
}

function createDbClient(): DbClient {
  return {
    execute(query) {
      if (typeof query === 'string') return tursoExecute(query);
      return tursoExecute(query.sql, query.args ?? []);
    },
    transaction(stmts) {
      return tursoTransaction(stmts);
    },
  };
}

let _client: DbClient | null = null;

export function getDb(): DbClient {
  if (!_client) _client = createDbClient();
  return _client;
}

export async function ensureDb(): Promise<DbClient> {
  return getDb();
}
