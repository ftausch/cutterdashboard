"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { can, ROLE_LABELS, type Role } from "@/lib/permissions";
import { NotificationBell } from "@/components/notification-bell";
import {
  Scissors,
  ChevronDown,
  User,
  Receipt,
  Link2,
  ShieldCheck,
  List,
  Bell,
  BarChart2,
  Settings,
  LogOut,
} from "lucide-react";

interface CutterSession {
  id: string;
  name: string;
  email: string;
  is_admin: boolean;
  role: Role;
}

// The only 4 items shown directly in the top bar
const PRIMARY_NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/videos",    label: "Videos"     },
  { href: "/performance", label: "Performance" },
  { href: "/episodes",  label: "Episoden"   },
] as const;

function getInitials(name: string): string {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

export function CutterNav() {
  const pathname  = usePathname();
  const router    = useRouter();
  const [session, setSession]   = useState<CutterSession | null>(null);
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
    const handler = () => setMenuOpen(false);
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [menuOpen]);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  if (!session) {
    return <header className="sticky top-0 z-50 border-b border-border bg-card/90 backdrop-blur-md h-14" />;
  }

  const isOps   = can(session.role, "OPS_READ");
  const isAdmin = can(session.role, "USER_MANAGE");

  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-card/90 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center px-4 gap-8">

        {/* Logo */}
        <Link
          href="/dashboard"
          className="flex items-center gap-2 shrink-0 group"
        >
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/15 group-hover:bg-primary/20 transition-colors">
            <Scissors className="h-3.5 w-3.5 text-primary" />
          </div>
          <span className="font-semibold text-sm tracking-tight hidden sm:block">Cutter</span>
        </Link>

        {/* Primary nav — 4 items, text-only */}
        <nav className="flex items-center gap-1 flex-1">
          {PRIMARY_NAV.map(({ href, label }) => {
            const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
            return (
              <Link
                key={href}
                href={href}
                className={`px-3 py-1.5 rounded-lg text-sm transition-colors duration-150 ${
                  active
                    ? "text-foreground font-medium bg-accent/60"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/40 font-normal"
                }`}
              >
                {label}
              </Link>
            );
          })}
        </nav>

        {/* Right side: bell + avatar */}
        <div className="flex items-center gap-1 shrink-0">
          <NotificationBell />

          {/* Profile dropdown */}
          <div className="relative" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setMenuOpen((p) => !p)}
              className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 hover:bg-accent/60 transition-colors"
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">
                {getInitials(session.name)}
              </div>
              <ChevronDown className={`h-3 w-3 text-muted-foreground transition-transform duration-150 ${menuOpen ? "rotate-180" : ""}`} />
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-56 rounded-xl border border-border bg-card shadow-xl p-1 z-50">
                {/* Identity */}
                <div className="px-3 py-2.5 mb-1">
                  <p className="text-sm font-medium truncate">{session.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{session.email}</p>
                  <p className="text-xs text-primary/70 mt-0.5">{ROLE_LABELS[session.role]}</p>
                </div>

                <div className="h-px bg-border mx-1 mb-1" />

                {/* My account */}
                <p className="px-3 pt-1 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
                  Konto
                </p>
                <DropdownLink href="/profile"  icon={User}    label="Profil & Rechnungsdaten" onClick={() => setMenuOpen(false)} />
                <DropdownLink href="/invoices" icon={Receipt}  label="Rechnungen"              onClick={() => setMenuOpen(false)} />
                <DropdownLink href="/accounts" icon={Link2}    label="Konten verwalten"        onClick={() => setMenuOpen(false)} />

                {/* Ops section */}
                {isOps && (
                  <>
                    <div className="h-px bg-border mx-1 my-1" />
                    <p className="px-3 pt-1 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
                      Ops
                    </p>
                    <DropdownLink href="/ops"           icon={ShieldCheck} label="Übersicht"  onClick={() => setMenuOpen(false)} />
                    <DropdownLink href="/ops/clips"     icon={List}        label="Clips"       onClick={() => setMenuOpen(false)} />
                    <DropdownLink href="/ops/alerts"    icon={Bell}        label="Alerts"      onClick={() => setMenuOpen(false)} />
                    <DropdownLink href="/ops/analytics" icon={BarChart2}   label="Analytics"   onClick={() => setMenuOpen(false)} />
                    {isAdmin && (
                      <DropdownLink href="/admin" icon={Settings} label="Admin" onClick={() => setMenuOpen(false)} />
                    )}
                  </>
                )}

                {/* Logout */}
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
    </header>
  );
}

// Small helper to keep the dropdown rows DRY
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
