import { Link, useLocation } from "wouter";
import { 
  LayoutDashboard, 
  Users, 
  KeyRound, 
  ServerCog, 
  Activity, 
  FlaskConical, 
  Star,
  ActivitySquare
} from "lucide-react";
import { useHealthCheck } from "@workspace/api-client-react";

export default function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { data: health } = useHealthCheck();

  const navigation = [
    { name: "Dashboard", href: "/", icon: LayoutDashboard },
    { name: "Agents", href: "/agents", icon: Users },
    { name: "Sessions", href: "/sessions", icon: KeyRound },
    { name: "Services", href: "/services", icon: ServerCog },
    { name: "Payments", href: "/payments", icon: Activity },
    { name: "Demo Lab", href: "/demo", icon: FlaskConical },
    { name: "Rate", href: "/rate", icon: Star },
  ];

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <div className="hidden w-64 flex-col border-r bg-sidebar md:flex">
        <div className="flex h-14 items-center border-b px-4">
          <div className="flex items-center gap-2 font-semibold text-sidebar-foreground">
            <ActivitySquare className="h-5 w-5 text-primary" />
            <span>Trust Fabric</span>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto py-4">
          <nav className="grid gap-1 px-2 text-sm font-medium">
            {navigation.map((item) => {
              const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 transition-all hover:text-sidebar-foreground ${
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-muted-foreground"
                  }`}
                >
                  <item.icon className="h-4 w-4" />
                  {item.name}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="border-t p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <div className={`h-2 w-2 rounded-full ${health?.status === 'ok' ? 'bg-green-500' : 'bg-red-500'}`} />
            System Status: {health?.status === 'ok' ? 'Operational' : 'Degraded'}
          </div>
        </div>
      </div>
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-14 items-center gap-4 border-b bg-background px-4 lg:px-6">
          <div className="w-full flex-1">
            {/* Header content could go here */}
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
