import { useSession } from "@/components/SessionProvider";
import { Link, useLocation } from "wouter";
import { LayoutDashboard, LogOut, Camera, ShieldCheck, Sparkles, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import logoUrl from "@/assets/logo-white.png";

interface NavItem {
  title: string;
  href: string;
  icon: any;
  role: "CHEF" | "ADMIN";
}

const navItems: NavItem[] = [
  { title: "Dashboard",        href: "/studio",          icon: LayoutDashboard, role: "CHEF"  },
  { title: "Scan Token",       href: "/studio/scan",     icon: Camera,          role: "CHEF"  },
  { title: "Dashboard",        href: "/admin",           icon: LayoutDashboard, role: "ADMIN" },
  { title: "Chef Verification",href: "/admin/chefs",     icon: ShieldCheck,     role: "ADMIN" },
  { title: "Curation",         href: "/admin/curation",  icon: Sparkles,        role: "ADMIN" },
  { title: "Spots",            href: "/admin/spots",     icon: MapPin,          role: "ADMIN" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useSession();
  const [location] = useLocation();

  if (!user) return null; // or loading

  const items = navItems.filter((item) => item.role === user.role);

  return (
    <div className="flex min-h-[100dvh] bg-background text-foreground">
      {/* Sidebar */}
      <aside className="w-64 border-r border-border bg-card flex flex-col">
        <div className="px-5 py-5 border-b border-border/50">
          <Link href="/" className="flex items-center gap-3">
            <div className="relative shrink-0">
              <div className="absolute inset-0 rounded-full blur-md opacity-30"
                style={{ background: "radial-gradient(circle, #D4AF37 0%, transparent 70%)" }}
              />
              <img
                src={logoUrl}
                alt="Friday Food Club"
                className="relative w-9 h-9 rounded-full object-cover border border-primary/30"
                style={{ boxShadow: "0 0 12px rgba(212,175,55,0.15)" }}
              />
            </div>
            <div className="flex flex-col leading-none">
              <span className="text-base font-serif font-bold gold-gradient-text leading-tight">Friday Food Club</span>
              <span className="text-[10px] text-muted-foreground uppercase tracking-[0.18em] mt-0.5 font-medium">
                {user.role === "CHEF" ? "Creator Studio" : "Control Room"}
              </span>
            </div>
          </Link>
        </div>

        <nav className="flex-1 px-4 space-y-1">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors",
                location === item.href
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
              )}
            >
              <item.icon className="w-4 h-4" />
              {item.title}
            </Link>
          ))}
        </nav>

        <div className="p-4 border-t border-border">
          <div className="flex items-center gap-3 px-3 py-2 mb-2">
            <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center border border-border">
              <span className="text-xs font-bold">{user.name?.charAt(0)}</span>
            </div>
            <div className="flex-1 overflow-hidden">
              <p className="text-sm font-medium truncate">{user.name}</p>
              <p className="text-xs text-muted-foreground truncate">{user.email}</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="flex items-center gap-3 px-3 py-2.5 w-full rounded-md text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col">
        <div className="flex-1 p-8 overflow-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
