import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  Users,
  KeyRound,
  ServerCog,
  Activity,
  FlaskConical,
  Star,
  ActivitySquare,
  Telescope,
  Compass,
  GitBranch,
  Link2,
  Cpu,
  Home,
} from "lucide-react";
import { useHealthCheck } from "@workspace/api-client-react";

const navigation = [
  { group: "Overview", items: [
    { name: "Home", href: "/home", icon: Home },
    { name: "Dashboard", href: "/", icon: LayoutDashboard },
  ]},
  { group: "Agents & Trust", items: [
    { name: "Agents", href: "/agents", icon: Users },
    { name: "Sessions", href: "/sessions", icon: KeyRound },
    { name: "Payments", href: "/payments", icon: Activity },
  ]},
  { group: "Marketplace", items: [
    { name: "Explore APIs", href: "/explore", icon: Compass },
    { name: "Services", href: "/services", icon: ServerCog },
    { name: "Workflows", href: "/workflows", icon: GitBranch },
  ]},
  { group: "Developer", items: [
    { name: "MCP Server", href: "/mcp", icon: Cpu },
    { name: "Pay Links", href: "/pay", icon: Link2 },
    { name: "Demo Lab", href: "/demo", icon: FlaskConical },
    { name: "Stellar Lab", href: "/stellar", icon: Telescope },
    { name: "Rate Agent", href: "/rate", icon: Star },
  ]},
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { data: health } = useHealthCheck();

  const isActive = (href: string) =>
    href === "/" ? location === "/" : location.startsWith(href);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <div className="hidden w-56 flex-col border-r bg-sidebar md:flex">
        <div className="flex h-14 items-center border-b px-4">
          <Link href="/home" className="flex items-center gap-2 font-semibold text-sidebar-foreground hover:text-primary transition-colors">
            <ActivitySquare className="h-4 w-4 text-primary" />
            <span className="text-sm">Trust Fabric</span>
          </Link>
        </div>
        <div className="flex-1 overflow-y-auto py-3">
          <nav className="grid gap-0 px-2 text-sm font-medium">
            {navigation.map((group) => (
              <div key={group.group} className="mb-3">
                <div className="px-3 py-1 text-xs font-semibold text-muted-foreground/60 uppercase tracking-wider">
                  {group.group}
                </div>
                {group.items.map((item) => {
                  const active = isActive(item.href);
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      className={`flex items-center gap-2.5 rounded-md px-3 py-1.5 transition-all hover:text-sidebar-foreground text-sm ${
                        active
                          ? "bg-sidebar-accent text-sidebar-accent-foreground"
                          : "text-muted-foreground"
                      }`}
                    >
                      <item.icon className="h-3.5 w-3.5 shrink-0" />
                      {item.name}
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>
        </div>
        <div className="border-t p-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <div
              className={`h-1.5 w-1.5 rounded-full ${
                health?.status === "ok" ? "bg-green-500" : "bg-red-500"
              }`}
            />
            <span>System Status: {health?.status === "ok" ? "Operational" : "Degraded"}</span>
          </div>
        </div>
      </div>

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-14 items-center gap-4 border-b bg-background px-4 lg:px-6">
          <div className="flex items-center gap-2 text-sm font-mono text-muted-foreground">
            <span className="text-primary">⬡</span>
            <span>Stellar Testnet</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Link href="/agents/new">
              <button className="text-xs font-mono text-muted-foreground hover:text-foreground transition-colors border border-border/60 px-2.5 py-1 rounded-md">
                + Register Agent
              </button>
            </Link>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
