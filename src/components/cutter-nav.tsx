"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { can, ROLE_LABELS, type Role } from "@/lib/permissions";
import { NotificationBell } from "@/components/notification-bell";
import {
  Scissors, ChevronDown, User, Receipt, Link2,
  ShieldCheck, List, Bell, BarChart2, Settings, LogOut,
} from "lucide-react";

interface CutterSession {
  id: string;
  name: string;
  email: string;
  is_admin: boolean;
  role: Role;
}

function getInitials(name: string): string {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

// ── Primary nav (center of top bar) ───────────────────────────
const PRIMARY_NAV = [
  { href: "/dashboard",   label: "Dashboard"   },
  { href: "/videos",      label: "Videos"      },
  { href: "/performance", label: "Performance" },
  { href: "/episodes",    label: "Episoden"    },
] as const;

// ── Secondary nav rows ─────────────────────────────────────────
// Each item has an explicit `match` fn so active logic is unambiguous.
type SecondaryItem = {
  href: string;
  label: string;
  icon: React.ElementType;
  match: (p: string) => boolean;
  opsOnly?: boolean;
  adminOnly?: boolean;
};

const SECONDARY_NAV: SecondaryItem[] = [
  // Always visible
  { href: "/invoices", label: "Rechnungen", icon: Receipt,    match: (p) => p.startsWith("/invoices") },
  { href: "/accounts", label: "Konten",     icon: Link2,      match: (p) => p.startsWith("/accounts") },
  // Ops-gated
  { href: "/ops",           label: "Ops",       icon: ShieldCheck, match: (p) => p === "/ops",           opsOnly: true },
  { href: "/ops/cutters",   label: "Cutter",    icon: User,        match: (p) => p.startsWith("/ops/cutters"),   opsOnly: true },
  { href: "/ops/clips",     label: "Clips",     icon: List,        match: (p) => p.startsWith("/ops/clips"),     opsOnly: true },
  { href: "/ops/alerts",    label: "Alerts",    icon: Bell,        match: (p) => p.startsWith("/ops/alerts"),    opsOnly: true },
  { href: "/ops/analytics", label: "Analytics", icon: BarChart2,   match: (p) => p.startsWith("/ops/analytics"), opsOnly: true },
  // Admin-gated
  { href: "/admin", label: "Admin", icon: Settings, match: (p) => p.startsWith("/admin"), adminOnly: true },
];

// ── Helpers ────────────────────────────────────────────────────
function DropdownLink({
  href, icon: Icon, label, onClick,
}: {
  href: string;
  icon: React.ElementType;
  label: string;
  onClick: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      {label}
    </Link>
  );
}

// ── Component ──────────────────────────────────────────────────
export function CutterNav() {
  const pathname = usePathname();
  const router   = useRouter();
  const [session,  setSession]  = useState<CutterSession | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    fetch("/api/auth/session")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && !data.error) setSession(data);
        else router.push("/login");
      })
      .catch(() => router.push("/login"));
  }, [router]);

  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(false);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [menuOpen]);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  // Skeleton while session loads
  if (!session) {
    return (
      <header className="sticky top-0 z-50">
        <div className="h-14 border-b border-border/60 bg-card/90 backdrop-blur-md" />
        <div className="h-9  border-b border-border/30 bg-card/50 backdrop-blur-md" />
      </header>
    );
  }

  const isOps   = can(session.role, "OPS_READ");
  const isAdmin = can(session.role, "USER_MANAGE");

  // Filter secondary nav to what this role can see
  const visibleSecondary = SECONDARY_NAV.filter((item) => {
    if (item.adminOnly) return isAdmin;
    if (item.opsOnly)   return isOps;
    return true;
  });

  // Insert a visual divider before the first ops item
  const firstOpsIdx = visibleSecondary.findIndex((i) => i.opsOnly || i.adminOnly);

  return (
    <header className="sticky top-0 z-50">

      {/* ── Primary bar ───────────────────────────────────────── */}
      <div className="border-b border-border/60 bg-card/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-8 px-4">

          {/* Logo */}
          <Link href="/dashboard" className="flex items-center gap-2 shrink-0 group">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/15 group-hover:bg-primary/20 transition-colors">
              <Scissors className="h-3.5 w-3.5 text-primary" />
            </div>
            <span className="font-semibold text-sm tracking-tight hidden sm:block">Cutter</span>
          </Link>

          {/* Primary nav */}
          <nav className="flex items-center gap-0.5 flex-1">
            {PRIMARY_NAV.map(({ href, label }) => {
              const active =
                href === "/dashboard"
                  ? pathname === "/dashboard"
                  : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={`px-3 py-1.5 rounded-lg text-sm transition-colors duration-150 ${
                    active
                      ? "bg-accent/70 text-foreground font-medium"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent/40"
                  }`}
                >
                  {label}
                </Link>
              );
            })}
          </nav>

          {/* Right: bell + profile */}
          <div className="flex items-center gap-1 shrink-0">
            <NotificationBell />

            <div className="relative" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => setMenuOpen((p) => !p)}
                className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 hover:bg-accent/60 transition-colors"
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">
                  {getInitials(session.name)}
                </div>
                <div className="hidden sm:block text-left">
                  <p className="text-xs font-medium leading-tight">{session.name.split(" ")[0]}</p>
                  <p className="text-[10px] text-muted-foreground leading-tight">{ROLE_LABELS[session.role]}</p>
                </div>
                <ChevronDown className={`h-3 w-3 text-muted-foreground transition-transform duration-150 ${menuOpen ? "rotate-180" : ""}`} />
              </button>

              {menuOpen && (
                <div className="absolute right-0 top-full mt-1.5 w-56 rounded-xl border border-border bg-card shadow-xl p-1 z-50">
                  {/* Identity */}
                  <div className="px-3 py-2.5">
                    <p className="text-sm font-medium truncate">{session.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{session.email}</p>
                  </div>
                  <div className="h-px bg-border mx-1 mb-1" />

                  <DropdownLink href="/profile" icon={User} label="Profil & Einstellungen" onClick={() => setMenuOpen(false)} />

                  <div className="h-px bg-border mx-1 my-1" />
                  <button
                    onClick={handleLogout}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    Abmelden
                  </button>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* ── Secondary bar ─────────────────────────────────────── */}
      <div className="border-b border-border/30 bg-card/50 backdrop-blur-md">
        <div className="mx-auto flex h-9 max-w-6xl items-center gap-0.5 px-4">
          {visibleSecondary.map((item, idx) => {
            const active = item.match(pathname);
            const showDivider = idx === firstOpsIdx && firstOpsIdx > 0;
            return (
              <span key={item.href} className="flex items-center">
                {showDivider && (
                  <span className="mx-2 h-3.5 w-px bg-border/60 shrink-0" />
                )}
                <Link
                  href={item.href}
                  className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-colors duration-150 ${
                    active
                      ? "text-foreground font-medium bg-accent/50"
                      : "text-muted-foreground/70 hover:text-muted-foreground hover:bg-accent/30"
                  }`}
                >
                  <item.icon className={`h-3 w-3 shrink-0 ${active ? "text-primary" : ""}`} />
                  {item.label}
                </Link>
              </span>
            );
          })}
        </div>
      </div>

    </header>
  );
}
