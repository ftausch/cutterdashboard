"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { can, ROLE_LABELS, type Role } from "@/lib/permissions";
import { NotificationBell } from "@/components/notification-bell";
import {
  Scissors, ChevronDown, User, Receipt, Link2,
  ShieldCheck, List, Bell, BarChart2, Settings, LogOut,
  Menu, X, Home, Video, TrendingUp, BookOpen, ListChecks, Wallet, Inbox, ClipboardCheck, LineChart,
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

// ── Primary nav ────────────────────────────────────────────────
const PRIMARY_NAV = [
  { href: "/dashboard",   label: "Dashboard",   icon: Home      },
  { href: "/videos",      label: "Videos",      icon: Video     },
  { href: "/performance", label: "Performance", icon: TrendingUp },
  { href: "/episodes",    label: "Episoden",    icon: BookOpen  },
  { href: "/insights",    label: "Insights",    icon: LineChart  },
] as const;

// ── Secondary nav ──────────────────────────────────────────────
type SecondaryItem = {
  href: string;
  label: string;
  icon: React.ElementType;
  match: (p: string) => boolean;
  opsOnly?: boolean;
  adminOnly?: boolean;
};

const SECONDARY_NAV: SecondaryItem[] = [
  { href: "/invoices",      label: "Rechnungen", icon: Receipt,     match: (p) => p.startsWith("/invoices") },
  { href: "/accounts",      label: "Konten",     icon: Link2,       match: (p) => p.startsWith("/accounts") },
  { href: "/ops",           label: "Ops",        icon: ShieldCheck, match: (p) => p === "/ops",                   opsOnly: true },
  { href: "/ops/inbox",     label: "Inbox",      icon: Inbox,       match: (p) => p.startsWith("/ops/inbox"),     opsOnly: true },
  { href: "/ops/queue",     label: "Queue",      icon: ListChecks,  match: (p) => p.startsWith("/ops/queue"),     opsOnly: true },
  { href: "/ops/cutters",   label: "Cutter",     icon: User,        match: (p) => p.startsWith("/ops/cutters"),   opsOnly: true },
  { href: "/ops/clips",     label: "Clips",      icon: List,        match: (p) => p.startsWith("/ops/clips"),     opsOnly: true },
  { href: "/ops/alerts",    label: "Alerts",     icon: Bell,        match: (p) => p.startsWith("/ops/alerts"),    opsOnly: true },
  { href: "/ops/analytics", label: "Analytics",  icon: BarChart2,   match: (p) => p.startsWith("/ops/analytics"), opsOnly: true },
  { href: "/ops/billing",   label: "Abrechnung", icon: Wallet,          match: (p) => p.startsWith("/ops/billing"),   opsOnly: true },
  { href: "/ops/audits",   label: "Audits",     icon: ClipboardCheck,  match: (p) => p.startsWith("/ops/audits"),    opsOnly: true },
  { href: "/ops/insights", label: "Insights",   icon: LineChart,       match: (p) => p.startsWith("/ops/insights"),  opsOnly: true },
  { href: "/admin",         label: "Admin",      icon: Settings,    match: (p) => p.startsWith("/admin"),         adminOnly: true },
];

// ── Component ──────────────────────────────────────────────────
export function CutterNav() {
  const pathname = usePathname();
  const router   = useRouter();
  const [session,    setSession]    = useState<CutterSession | null>(null);
  const [menuOpen,   setMenuOpen]   = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

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

  useEffect(() => { setMobileOpen(false); }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  if (!session) {
    return (
      <header className="sticky top-0 z-50">
        <div className="h-13 border-b border-border/50 bg-card/95 backdrop-blur-md" />
        <div className="h-8  border-b border-border/30 bg-card/70 backdrop-blur-md" />
      </header>
    );
  }

  const isOps   = can(session.role, "OPS_READ");
  const isAdmin = can(session.role, "USER_MANAGE");

  const visibleSecondary = SECONDARY_NAV.filter((item) => {
    if (item.adminOnly) return isAdmin;
    if (item.opsOnly)   return isOps;
    return true;
  });

  const firstOpsIdx = visibleSecondary.findIndex((i) => i.opsOnly || i.adminOnly);

  return (
    <>
      <header className="sticky top-0 z-50">

        {/* ── Primary bar ─────────────────────────────────────── */}
        <div className="border-b border-border/50 bg-card/95 backdrop-blur-md">
          <div className="mx-auto flex h-13 max-w-6xl items-center gap-5 px-6">

            {/* Hamburger — mobile only */}
            <button
              onClick={() => setMobileOpen((p) => !p)}
              className="md:hidden flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
              aria-label="Menü öffnen"
            >
              {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>

            {/* Logo */}
            <Link href="/dashboard" className="flex items-center gap-2.5 shrink-0 group">
              <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 border border-primary/20 group-hover:bg-primary/15 transition-colors">
                <Scissors className="h-3.5 w-3.5 text-primary" strokeWidth={2.5} />
              </div>
              <span className="font-semibold text-sm tracking-tight text-foreground/90">Cutter</span>
            </Link>

            {/* Divider */}
            <div className="hidden md:block h-4 w-px bg-border/60" />

            {/* Primary nav — desktop only */}
            <nav className="hidden md:flex items-center gap-0 flex-1">
              {PRIMARY_NAV.map(({ href, label }) => {
                const active =
                  href === "/dashboard"
                    ? pathname === "/dashboard"
                    : pathname.startsWith(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    className={`px-3 py-1.5 rounded-md text-sm transition-colors duration-150 ${
                      active
                        ? "text-foreground font-medium"
                        : "text-muted-foreground hover:text-foreground/80"
                    }`}
                  >
                    {label}
                  </Link>
                );
              })}
            </nav>

            {/* Spacer on mobile */}
            <div className="flex-1 md:hidden" />

            {/* Right: bell + profile */}
            <div className="flex items-center gap-1 shrink-0">
              <NotificationBell />

              <div className="relative" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => setMenuOpen((p) => !p)}
                  className={`flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors ${
                    menuOpen ? "bg-accent/60" : "hover:bg-accent/40"
                  }`}
                >
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary tracking-tight">
                    {getInitials(session.name)}
                  </div>
                  <div className="hidden sm:block text-left">
                    <p className="text-xs font-medium leading-tight">{session.name.split(" ")[0]}</p>
                  </div>
                  <ChevronDown className={`h-3 w-3 text-muted-foreground transition-transform duration-150 ${menuOpen ? "rotate-180" : ""}`} />
                </button>

                {menuOpen && (
                  <div className="absolute right-0 top-full mt-2 w-52 rounded-lg border border-border bg-popover shadow-2xl shadow-black/40 p-1 z-50">
                    <div className="px-3 py-2.5 mb-0.5">
                      <p className="text-sm font-medium truncate">{session.name}</p>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{session.email}</p>
                      <span className="mt-1.5 inline-block rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                        {ROLE_LABELS[session.role]}
                      </span>
                    </div>
                    <div className="h-px bg-border mx-1 mb-1" />
                    <Link
                      href="/profile"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                    >
                      <User className="h-3.5 w-3.5" />
                      Profil & Einstellungen
                    </Link>
                    <div className="h-px bg-border mx-1 my-1" />
                    <button
                      onClick={handleLogout}
                      className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
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

        {/* ── Secondary bar — desktop only ────────────────────── */}
        <div className="hidden md:block border-b border-border/30 bg-card/70 backdrop-blur-md">
          <div className="mx-auto flex h-8 max-w-6xl items-center gap-0 px-6">
            {visibleSecondary.map((item, idx) => {
              const active      = item.match(pathname);
              const showDivider = idx === firstOpsIdx && firstOpsIdx > 0;
              return (
                <span key={item.href} className="flex items-center">
                  {showDivider && (
                    <span className="mx-3 h-3 w-px bg-border/50 shrink-0" />
                  )}
                  <Link
                    href={item.href}
                    className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-colors duration-150 ${
                      active
                        ? "text-foreground font-medium"
                        : "text-muted-foreground/60 hover:text-muted-foreground"
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

      {/* ── Mobile menu overlay ──────────────────────────────── */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-background/80 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />

          {/* Drawer */}
          <div className="absolute top-[calc(3.25rem+1px)] left-0 right-0 bottom-0 bg-card border-t border-border/50 overflow-y-auto">
            <div className="p-5 space-y-0.5">

              {/* Identity */}
              <div className="flex items-center gap-3 px-3 py-3.5 mb-1">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/15 text-sm font-bold text-primary">
                  {getInitials(session.name)}
                </div>
                <div>
                  <p className="text-sm font-medium">{session.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{session.email}</p>
                </div>
              </div>

              <div className="h-px bg-border/60 mb-4" />

              {/* Primary nav */}
              <p className="px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/40 mb-2">Navigation</p>
              {PRIMARY_NAV.map(({ href, label, icon: Icon }) => {
                const active = href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                      active ? "bg-accent/50 text-foreground font-medium" : "text-muted-foreground hover:bg-accent/30 hover:text-foreground"
                    }`}
                  >
                    <Icon className={`h-4 w-4 shrink-0 ${active ? "text-primary" : "text-muted-foreground/50"}`} />
                    {label}
                  </Link>
                );
              })}

              <div className="h-px bg-border/60 my-4" />

              {/* Secondary nav */}
              <p className="px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/40 mb-2">Mehr</p>
              {visibleSecondary.map((item, idx) => {
                const active      = item.match(pathname);
                const showDivider = idx === firstOpsIdx && firstOpsIdx > 0;
                return (
                  <span key={item.href} className="block">
                    {showDivider && (
                      <>
                        <div className="h-px bg-border/60 my-3" />
                        <p className="px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/40 mb-2">Ops</p>
                      </>
                    )}
                    <Link
                      href={item.href}
                      className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                        active ? "bg-accent/50 text-foreground font-medium" : "text-muted-foreground hover:bg-accent/30 hover:text-foreground"
                      }`}
                    >
                      <item.icon className={`h-4 w-4 shrink-0 ${active ? "text-primary" : "text-muted-foreground/50"}`} />
                      {item.label}
                    </Link>
                  </span>
                );
              })}

              <div className="h-px bg-border/60 my-4" />

              <Link
                href="/profile"
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted-foreground hover:bg-accent/30 hover:text-foreground transition-colors"
              >
                <User className="h-4 w-4 shrink-0 text-muted-foreground/50" />
                Profil & Einstellungen
              </Link>
              <button
                onClick={handleLogout}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
              >
                <LogOut className="h-4 w-4 shrink-0 text-muted-foreground/50" />
                Abmelden
              </button>

            </div>
          </div>
        </div>
      )}
    </>
  );
}
