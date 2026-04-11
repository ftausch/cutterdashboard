#!/usr/bin/env python3
"""
Migration: RBAC v0.8.0 — ensure viewer role is supported.

SQLite / Turso does not enforce CHECK constraints on TEXT columns strictly,
so no schema change is needed. This migration:
1. Verifies the cutters table has the 'role' column (should already exist).
2. Verifies existing rows have a valid role value (backfill NULL → 'cutter').
3. Optionally creates a test viewer account (commented out by default).
"""

import os, re, sys, urllib.request, urllib.error, json

# ── Load env ──────────────────────────────────────────────────────────────────
env_path = os.path.join(os.path.dirname(__file__), ".env.local")
raw = open(env_path).read()

m_url   = re.search(r'TURSO_DATABASE_URL=["\']?([^"\'\n]+)["\']?', raw)
m_token = re.search(r'TURSO_AUTH_TOKEN=["\']?([^"\'\n]+)["\']?', raw)

if not m_url or not m_token:
    sys.exit("❌  Could not find TURSO_DATABASE_URL or TURSO_AUTH_TOKEN in .env.local")

db_url = m_url.group(1).strip().strip("\"'").replace("\\n", "").replace("libsql://", "https://").strip()
token  = m_token.group(1).strip().strip("\"'").replace("\\n", "").strip()
api    = f"{db_url}/v2/pipeline"
headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def run(sql: str, args=None) -> dict:
    body = json.dumps({
        "requests": [
            {"type": "execute", "stmt": {"sql": sql, "args": args or []}},
            {"type": "close"},
        ]
    }).encode()
    req = urllib.request.Request(api, data=body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req) as r:
            data = json.loads(r.read())
    except urllib.error.HTTPError as e:
        sys.exit(f"❌  HTTP {e.code}: {e.read().decode()}")
    result = data["results"][0]
    if result["type"] == "error":
        sys.exit(f"❌  SQL error: {result['error']['message']}")
    return result


print("Running RBAC v0.8.0 migration…")

# 1. Backfill NULL roles → 'cutter'
result = run("UPDATE cutters SET role = 'cutter' WHERE role IS NULL OR role = ''")
print("  ✓  Backfilled NULL/empty roles to 'cutter'")

# 2. Check for any unexpected role values
result = run(
    "SELECT id, name, role FROM cutters WHERE role NOT IN ('super_admin', 'ops_manager', 'cutter', 'viewer')"
)
rows = result.get("response", {}).get("result", {}).get("rows", [])
if rows:
    print(f"\n  ⚠️  Found {len(rows)} row(s) with unexpected role values:")
    for row in rows:
        print(f"     - {row}")
    print("  These will remain unchanged. Fix manually if needed.")
else:
    print("  ✓  All existing role values are valid")

# 3. Print role distribution
result = run("SELECT role, COUNT(*) as count FROM cutters GROUP BY role ORDER BY count DESC")
rows = result.get("response", {}).get("result", {}).get("rows", [])
print("\n  Current role distribution:")
for row in rows:
    role = row[0]["value"] if isinstance(row[0], dict) else row[0]
    count = row[1]["value"] if isinstance(row[1], dict) else row[1]
    print(f"    {role}: {count}")

# ── Optional: create a test viewer account ────────────────────────────────────
# Uncomment to create a read-only viewer account:
#
# import uuid
# viewer_id = str(uuid.uuid4())
# run(
#     "INSERT OR IGNORE INTO cutters (id, name, email, role, rate_per_view) VALUES (?, ?, ?, 'viewer', 0)",
#     [{"type":"text","value": viewer_id},
#      {"type":"text","value": "Viewer Account"},
#      {"type":"text","value": "viewer@example.com"}]
# )
# print("\n  ✓  Created test viewer account: viewer@example.com")

print("\n✅  RBAC v0.8.0 migration complete.")
print("   New roles available: super_admin, ops_manager, cutter, viewer")
print("   Assign roles in the Admin panel at /admin (role dropdown per user).")
