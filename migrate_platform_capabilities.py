#!/usr/bin/env python3
"""
Migration: Platform capability columns for cutter_accounts (v0.9.0).

Adds view-verification and capability tracking fields to cutter_accounts.
Back-fills connection_status and capability flags for existing rows.
"""

import os, re, sys, json, urllib.request, urllib.error

# ── Load env ───────────────────────────────────────────────────
env_path = os.path.join(os.path.dirname(__file__), ".env.local")
raw = open(env_path).read()

m_url   = re.search(r'TURSO_DATABASE_URL=["\']?([^"\'\n]+)["\']?', raw)
m_token = re.search(r'TURSO_AUTH_TOKEN=["\']?([^"\'\n]+)["\']?', raw)

if not m_url or not m_token:
    sys.exit("❌  Could not find TURSO_DATABASE_URL or TURSO_AUTH_TOKEN in .env.local")

db_url  = m_url.group(1).strip().strip("\"'").replace("\\n","").replace("libsql://","https://").strip()
token   = m_token.group(1).strip().strip("\"'").replace("\\n","").strip()
api     = f"{db_url}/v2/pipeline"
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
            result = data["results"][0]
            if result["type"] == "error":
                raise RuntimeError(result["error"]["message"])
            return result
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"HTTP {e.code}: {e.read().decode()}")


def add_column_safe(table: str, col: str, definition: str):
    """Add a column, ignore error if it already exists."""
    try:
        run(f"ALTER TABLE {table} ADD COLUMN {col} {definition}")
        print(f"  ✅  Added column: {col}")
    except RuntimeError as e:
        if "duplicate column" in str(e).lower() or "already exists" in str(e).lower():
            print(f"  ⏭   Column already exists: {col}")
        else:
            raise


print("\n🔧  migrate_platform_capabilities.py")
print("=" * 55)

# ── Step 1: Add new columns ────────────────────────────────────
print("\n[1/3] Adding capability columns to cutter_accounts…")

add_column_safe("cutter_accounts", "connection_status",       "TEXT NOT NULL DEFAULT 'manual'")
add_column_safe("cutter_accounts", "connection_type",         "TEXT NOT NULL DEFAULT 'manual'")
add_column_safe("cutter_accounts", "views_accessible",        "INTEGER NOT NULL DEFAULT 0")
add_column_safe("cutter_accounts", "verification_confidence", "TEXT NOT NULL DEFAULT 'none'")
add_column_safe("cutter_accounts", "oauth_refresh_token",     "TEXT")
add_column_safe("cutter_accounts", "oauth_scopes",            "TEXT")
add_column_safe("cutter_accounts", "platform_user_id",        "TEXT")
add_column_safe("cutter_accounts", "capability_flags",        "TEXT")
add_column_safe("cutter_accounts", "sync_error",              "TEXT")

# ── Step 2: Back-fill existing rows ───────────────────────────
print("\n[2/3] Back-filling capability fields for existing rows…")

# Instagram rows WITH an oauth_access_token → fully connected, views accessible
r = run("""
    UPDATE cutter_accounts
    SET
      connection_status       = 'connected',
      connection_type         = 'oauth',
      views_accessible        = 1,
      verification_confidence = 'medium'
    WHERE platform = 'instagram'
      AND oauth_access_token IS NOT NULL
      AND oauth_access_token != ''
""")
print(f"  ✅  Updated Instagram OAuth rows (views_accessible=1, confidence=medium)")

# Instagram rows WITHOUT a token → manual
run("""
    UPDATE cutter_accounts
    SET
      connection_status       = 'manual',
      connection_type         = 'manual',
      views_accessible        = 0,
      verification_confidence = 'none'
    WHERE platform = 'instagram'
      AND (oauth_access_token IS NULL OR oauth_access_token = '')
""")
print(f"  ✅  Updated Instagram manual rows")

# YouTube rows WITH a youtube_channel_id → treat as manual (no view API yet)
run("""
    UPDATE cutter_accounts
    SET
      connection_status       = CASE
        WHEN oauth_access_token IS NOT NULL AND oauth_access_token != '' THEN 'connected'
        ELSE 'manual'
      END,
      connection_type         = CASE
        WHEN oauth_access_token IS NOT NULL AND oauth_access_token != '' THEN 'oauth'
        ELSE 'manual'
      END,
      views_accessible        = CASE
        WHEN oauth_access_token IS NOT NULL AND oauth_access_token != '' THEN 1
        ELSE 0
      END,
      verification_confidence = CASE
        WHEN oauth_access_token IS NOT NULL AND oauth_access_token != '' THEN 'high'
        ELSE 'none'
      END
    WHERE platform = 'youtube'
""")
print(f"  ✅  Updated YouTube rows")

# TikTok + Facebook → always manual for now
run("""
    UPDATE cutter_accounts
    SET
      connection_status       = 'manual',
      connection_type         = 'manual',
      views_accessible        = 0,
      verification_confidence = 'none'
    WHERE platform IN ('tiktok', 'facebook')
      AND connection_type = 'manual'
""")
print(f"  ✅  Updated TikTok/Facebook manual rows")

# ── Step 3: Verify ────────────────────────────────────────────
print("\n[3/3] Verifying distribution…")
r = run("""
    SELECT platform, connection_status, connection_type,
           views_accessible, verification_confidence, COUNT(*) as cnt
    FROM cutter_accounts
    GROUP BY platform, connection_status, connection_type,
             views_accessible, verification_confidence
    ORDER BY platform
""")

rows = r.get("response", {}).get("result", {}).get("rows", [])
if rows:
    print(f"\n  {'Platform':<12} {'Status':<20} {'Type':<8} {'Views':<6} {'Confidence':<10} {'Count'}")
    print(f"  {'-'*12} {'-'*20} {'-'*8} {'-'*6} {'-'*10} {'-'*5}")
    for row in rows:
        vals = [c.get("value","") for c in row]
        print(f"  {str(vals[0]):<12} {str(vals[1]):<20} {str(vals[2]):<8} {str(vals[3]):<6} {str(vals[4]):<10} {vals[5]}")
else:
    print("  (no rows — table may be empty)")

print("\n✅  Migration complete.\n")
