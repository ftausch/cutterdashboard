"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { can, ROLE_LABELS, type Role } from "@/lib/permissions";
import { NotificationBell } from "@/components/notification-bell";
import {
  LayoutDashboard,
  Video,
  Receipt,
  Link2,
  User,
  Settings,
  LogOut,
  Scissors,
  ShieldCheck,
  Film,
  ChevronDown,
  BarChart2,
  List,
  Bell,
} from "lucide-react";

interface CutterSession {
  id: string;
  name: string;
  email: string;
  is_admin: boolean;
  role: Role;
}

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/videos", label: "Videos", icon: Video },
  { href: "/performance", label: "Performance", icon: BarChart2 },
  { href: "/episodes", label: "Episoden", icon: Film },
  { href: "/invoices", label: "Rechnungen", icon: Receipt },
  { href: "/accounts", label: "Konten", icon: Link2 },
];

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function getRoleLabel(role: string): string {
  return ROLE_LABELS[role as Role] ?? role;
}

export function CutterNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [session, setSession] = useState<CutterSession | null>(null);
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

  // Close menu on outside click
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

  if (!session) return (
    <header className="sticky top-0 z-50 border-b border-border bg-card/90 backdrop-blur-md h-14" />
  );

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-card/90 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4">

        {/* Logo */}
        <Link
          href="/dashboard"
          className="flex items-center gap-2 font-bold text-foreground shrink-0 group"
        >
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/15 group-hover:bg-primary/25 transition-colors">
            <Scissors className="h-4 w-4 text-primary" />
          </div>
          <span className="hidden sm:block">Cutter</span>
        </Link>

        {/* Divider */}
        <div className="h-5 w-px bg-border shrink-0" />

        {/* Navigation */}
        <nav className="flex items-center gap-0.5 overflow-x-auto scrollbar-none flex-1">
          {navItems.map((item) => {
            const isActive = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-all duration-150 ${
                  isActive
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                }`}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                <span className="hidden md:block">{item.label}</span>
              </Link>
            );
          })}

          {can(session.role, "OPS_READ") && (
            <Link
              href="/ops"
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-all duration-150 ${
                pathname === "/ops" || (pathname.startsWith("/ops") && !pathname.startsWith("/ops/clips"))
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
              }`}
            >
              <ShieldCheck className="h-4 w-4 shrink-0" />
              <span className="hidden md:block">Ops</span>
            </Link>
          )}

          {can(session.role, "OPS_READ") && (
            <Link
              href="/ops/clips"
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-all duration-150 ${
                pathname.startsWith("/ops/clips")
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
              }`}
            >
              <List className="h-4 w-4 shrink-0" />
              <span className="hidden md:block">Clips</span>
            </Link>
          )}

          {can(session.role, "ALERT_MANAGE") && (
            <Link
              href="/ops/alerts"
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-all duration-150 ${
                pathname.startsWith("/ops/alerts")
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
              }`}
            >
              <Bell className="h-4 w-4 shrink-0" />
              <span className="hidden md:block">Alerts</span>
            </Link>
          )}

          {can(session.role, "ANALYTICS_READ") && (
            <Link
              href="/ops/analytics"
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-all duration-150 ${
                pathname.startsWith("/ops/analytics")
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
              }`}
            >
              <BarChart2 className="h-4 w-4 shrink-0" />
              <span className="hidden md:block">Analytics</span>
            </Link>
          )}

          {can(session.role, "USER_MANAGE") && (
            <Link
              href="/admin"
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-all duration-150 ${
                pathname.startsWith("/admin")
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
              }`}
            >
              <Settings className="h-4 w-4 shrink-0" />
              <span className="hidden md:block">Admin</span>
            </Link>
          )}
        </nav>

        {/* Notification Bell */}
        <NotificationBell />

        {/* User menu */}
        <div className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => setMenuOpen((p) => !p)}
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-accent/60 transition-colors"
          >
            {/* Avatar */}
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">
              {getInitials(session.name)}
            </div>
            <div className="hidden sm:block text-left">
              <p className="text-xs font-medium leading-tight">{session.name.split(" ")[0]}</p>
              <p className="text-xs text-muted-foreground leading-tight">{getRoleLabel(session.role)}</p>
            </div>
            <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${menuOpen ? "rotate-180" : ""}`} />
          </button>

          {/* Dropdown */}
          {menuOpen && (
            <div className="absolute right-0 top-full mt-1.5 w-52 rounded-xl border border-border bg-card p-1 shadow-xl">
              <div className="px-3 py-2 border-b border-border mb-1">
                <p className="text-sm font-medium truncate">{session.name}</p>
                <p className="text-xs text-muted-foreground truncate">{session.email}</p>
              </div>
              <Link
                href="/profile"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              >
                <User className="h-4 w-4" />
                Profil & Rechnungsdaten
              </Link>
              <button
                onClick={handleLogout}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
              >
                <LogOut className="h-4 w-4" />
                Abmelden
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
