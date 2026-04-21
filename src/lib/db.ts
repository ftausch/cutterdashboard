// Direct Turso HTTP API client — no @libsql/client, no cold start issues

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

async function tursoExecute(sql: string, args: SqlValue[] = []): Promise<TursoResult> {
  const mappedArgs = args.map((v) => {
    if (v === null) return { type: 'null' };
    if (typeof v === 'number') return { type: Number.isInteger(v) ? 'integer' : 'float', value: v };
    return { type: 'text', value: String(v) };
  });

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
    throw new Error(`Turso HTTP error: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  const result = data.results[0];

  if (result.type === 'error') {
    throw new Error(`Turso SQL error: ${result.error.message}`);
  }

  const { cols, rows } = result.response.result;
  const mappedRows: TursoRow[] = rows.map((row: any[]) =>
    Object.fromEntries(cols.map((col: { name: string }, i: number) => {
      const cell = row[i];
      const val = cell?.type === 'null' || cell === null ? null : cell?.value ?? null;
      // Convert numeric strings to numbers for integer/float types
      if (cell?.type === 'integer') return [col.name, val !== null ? parseInt(val, 10) : null];
      if (cell?.type === 'float') return [col.name, val !== null ? parseFloat(val) : null];
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
        args: (s.args ?? []).map((v) => {
          if (v === null) return { type: 'null' };
          if (typeof v === 'number') return { type: Number.isInteger(v) ? 'integer' : 'float', value: v };
          return { type: 'text', value: String(v) };
        }),
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

  // Check for errors
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
        if (cell?.type === 'float') return [col.name, val !== null ? parseFloat(val) : null];
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
