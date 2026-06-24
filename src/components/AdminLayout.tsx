import { Outlet, useNavigate } from "@/lib/router-compat";
import { useAuth } from "@/contexts/AuthContext";
import { NavLink } from "@/components/NavLink";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { LayoutGrid, FileText, Users, ClipboardList, CheckSquare, CalendarDays, Wallet, LogOut, MessageCircle, RotateCcw, History, Settings, Phone, Mail, Mailbox, Search, ShieldCheck, LayoutDashboard, Globe, Upload, Server, CalendarClock, Handshake, BarChart3 } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AdminCommandPalette } from "@/components/AdminCommandPalette";
import { useAdminBadges } from "@/hooks/use-admin-badges";
import { useEffect } from "react";

type BadgeKey = "unreadChat" | "pendingKyc" | "newApplications";
type NavItem = {
  title: string;
  url: string;
  icon: typeof LayoutGrid;
  end?: boolean;
  badgeKey?: BadgeKey;
  tint?: string; // bg color class for icon tile
};
type NavGroup = { label: string; items: NavItem[] };

// Icon-Kachel-Farben pro Item (Screenshot-Look)
const TINT = {
  blue: "bg-blue-500",
  indigo: "bg-indigo-500",
  violet: "bg-violet-500",
  pink: "bg-pink-500",
  rose: "bg-rose-500",
  orange: "bg-orange-500",
  amber: "bg-amber-500",
  emerald: "bg-emerald-500",
  teal: "bg-teal-500",
  cyan: "bg-cyan-500",
  sky: "bg-sky-500",
  slate: "bg-slate-500",
} as const;

// Gruppierte Navigation – übersichtlicher als flache Liste.
const dashboardItem: NavItem = { title: "Dashboard", url: "/admin", icon: LayoutDashboard, end: true, tint: TINT.blue };

const navGroups: NavGroup[] = [
  {
    label: "Personen",
    items: [
      { title: "Bewerbungen", url: "/admin/applications", icon: FileText, badgeKey: "newApplications", tint: TINT.indigo },
      { title: "Mitarbeiter", url: "/admin/employees", icon: Users, tint: TINT.violet },
      { title: "KYC", url: "/admin/kyc", icon: ShieldCheck, badgeKey: "pendingKyc", tint: TINT.emerald },
      { title: "Verträge", url: "/admin/contracts", icon: FileText, tint: TINT.sky },
    ],
  },
  {
    label: "Aufträge",
    items: [
      { title: "Aufträge", url: "/admin/tasks", icon: ClipboardList, tint: TINT.orange },
      { title: "Prüfungen", url: "/admin/reviews", icon: CheckSquare, tint: TINT.emerald },
      { title: "Nachbesserungen", url: "/admin/revisions", icon: RotateCcw, tint: TINT.amber },
      { title: "Uploads", url: "/admin/uploads", icon: Upload, tint: TINT.cyan },
      { title: "Termine", url: "/admin/appointments", icon: CalendarDays, tint: TINT.pink },
    ],
  },
  {
    label: "Kommunikation",
    items: [
      { title: "Chat", url: "/admin/chat", icon: MessageCircle, badgeKey: "unreadChat", tint: TINT.blue },
      { title: "SMS", url: "/admin/sms", icon: Phone, tint: TINT.teal },
      { title: "Post", url: "/admin/post", icon: Mailbox, tint: TINT.rose },
      { title: "E-Mail-Center", url: "/admin/email-center", icon: Mail, tint: TINT.indigo },
    ],
  },
  {
    label: "Finanzen",
    items: [
      { title: "Transaktionen", url: "/admin/transactions", icon: Wallet, tint: TINT.emerald },
    ],
  },
  {
    label: "Vermittlung",
    items: [
      { title: "Übersicht", url: "/admin/vermittlung", icon: Handshake, end: true, tint: TINT.violet },
      { title: "Partner-Firmen", url: "/admin/partner-companies", icon: Handshake, tint: TINT.pink },
      { title: "Calendly", url: "/admin/calendly", icon: CalendarClock, tint: TINT.sky },
    ],
  },
  {
    label: "Auswertung",
    items: [
      { title: "Statistiken", url: "/admin/statistiken", icon: BarChart3, tint: TINT.amber },
    ],
  },
  {
    label: "System",
    items: [
      { title: "Landing-Generator", url: "/admin/landing-generator", icon: Globe, tint: TINT.cyan },
      { title: "Infrastruktur", url: "/admin/infrastructure", icon: Server, tint: TINT.slate },
      { title: "Domains", url: "/admin/domains", icon: Globe, tint: TINT.teal },
      { title: "Einstellungen", url: "/admin/settings", icon: Settings, tint: TINT.slate },
    ],
  },
];

function AdminSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { signOut } = useAuth();
  const badges = useAdminBadges();

  const renderItem = (item: NavItem) => {
    const count = item.badgeKey ? badges[item.badgeKey] : 0;
    const tint = item.tint ?? TINT.slate;
    return (
      <SidebarMenuItem key={item.title}>
        <SidebarMenuButton asChild className="h-auto p-0">
          <NavLink
            to={item.url}
            end={item.end}
            className="group relative flex! flex-row! flex-nowrap! items-center! gap-3 px-2 py-1.5 rounded-xl text-[13px] font-medium text-sidebar-foreground/80 hover:bg-sidebar-accent transition-colors overflow-hidden whitespace-nowrap"
            activeClassName="bg-sidebar-accent! text-sidebar-foreground! font-semibold"
          >
            <span className={`grid place-items-center h-7 w-7 rounded-lg ${tint} text-white shadow-sm shrink-0`}>
              <item.icon className="h-[15px] w-[15px]" strokeWidth={2.25} />
            </span>
            {!collapsed && <span className="truncate min-w-0">{item.title}</span>}
            {count > 0 && (
              <span
                className={
                  collapsed
                    ? "absolute top-0.5 right-0.5 inline-flex h-3.5 min-w-[14px] px-1 rounded-full bg-rose-500 text-white text-[9px] font-medium items-center justify-center leading-none"
                    : "ml-auto inline-flex h-[18px] min-w-[18px] w-auto px-1.5 rounded-full bg-rose-500 text-white text-[10px] font-semibold items-center justify-center leading-none shrink-0"
                }
              >
                {count > 99 ? "99+" : count}
              </span>
            )}
          </NavLink>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  };

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border bg-sidebar">
      <SidebarContent className="flex flex-col h-full">
        {/* Brand */}
        <div className={collapsed ? "px-2 py-4 flex justify-center" : "px-4 py-4 flex items-center gap-2.5"}>
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 grid place-items-center text-white text-sm font-bold shadow-sm shrink-0">
            A
          </div>
          {!collapsed && (
            <span className="text-[15px] font-bold text-sidebar-foreground tracking-tight">ADMIN</span>
          )}
        </div>

        {/* Dashboard solo */}
        <div className="px-2">
          <SidebarGroup className="py-0">
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5">{renderItem(dashboardItem)}</SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </div>

        {/* Gruppierte Navigation */}
        <div className="flex-1 overflow-y-auto px-2 pb-2">
          {navGroups.map((grp) => (
            <SidebarGroup key={grp.label} className="py-1">
              {!collapsed && (
                <SidebarGroupLabel className="text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/40 px-2.5 mb-1">
                  {grp.label}
                </SidebarGroupLabel>
              )}
              <SidebarGroupContent>
                <SidebarMenu className="gap-0.5">{grp.items.map(renderItem)}</SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </div>

        {/* Logout */}
        <div className="border-t border-sidebar-border p-2">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={signOut}
                className="h-auto p-2 gap-3 rounded-xl text-[13px] font-medium text-sidebar-foreground/80 hover:text-sidebar-foreground hover:bg-sidebar-accent"
              >
                <span className="grid place-items-center h-7 w-7 rounded-lg bg-slate-500 text-white shadow-sm shrink-0">
                  <LogOut className="h-[15px] w-[15px]" strokeWidth={2.25} />
                </span>
                {!collapsed && <span>Abmelden</span>}
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </div>
      </SidebarContent>
    </Sidebar>
  );
}

export default function AdminLayout() {
  const { user, isAdmin, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) navigate("/login");
    if (!loading && user && !isAdmin) navigate("/dashboard");
  }, [user, isAdmin, loading, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-primary/20 animate-pulse" />
          <p className="text-sm text-muted-foreground">Laden…</p>
        </div>
      </div>
    );
  }

  if (!user || !isAdmin) return null;

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full admin-layout">
        <AdminSidebar />
        <div className="flex-1 flex flex-col min-w-0 bg-background">
          <header className="h-12 flex items-center border-b border-border bg-card px-5 gap-3 shrink-0">
            <SidebarTrigger />
            <div className="h-4 w-px bg-border" />
            <span className="text-xs font-heading font-semibold text-muted-foreground uppercase tracking-wider">Admin Panel</span>
            <button
              onClick={() => {
                // Synthetic Cmd+K
                window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }));
              }}
              className="ml-4 hidden sm:flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground border border-border rounded-md px-2 py-1 transition-colors"
              title="Schnellsuche"
            >
              <Search className="h-3.5 w-3.5" /> Suchen…
              <kbd className="ml-2 text-[10px] bg-muted px-1 py-0.5 rounded">⌘K</kbd>
            </button>
            <div className="ml-auto">
              <ThemeToggle />
            </div>
          </header>
          <main className="flex-1 overflow-auto">
            <Outlet />
          </main>
          <AdminCommandPalette />
        </div>
      </div>
    </SidebarProvider>
  );
}
