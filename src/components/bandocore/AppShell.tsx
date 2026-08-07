import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, Building2, CreditCard, LogOut } from "lucide-react";
import { BrandLogo } from "@/components/bandocore/BrandLogo";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { ReactNode } from "react";

export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const signOut = async () => {
    await supabase.auth.signOut();
    toast.success("Sessione chiusa");
    navigate({ to: "/auth", replace: true });
  };

  const nav = [
    { to: "/dashboard", label: "Radar Bandi", icon: LayoutDashboard },
    { to: "/profilo", label: "Profilo Azienda", icon: Building2 },
    { to: "/prezzi", label: "Piano e prezzi", icon: CreditCard },
  ] as const;

  return (
    <div className="min-h-screen bg-background text-foreground flex">
      {/* Sidebar desktop */}
      <aside className="hidden lg:flex w-64 flex-col border-r border-border bg-sidebar">
        <Link
          to="/dashboard"
          className="flex items-center gap-2 px-6 py-6 border-b border-sidebar-border"
        >
          <BrandLogo />
        </Link>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {nav.map((item) => {
            const active = pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground"
                }`}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <button
          onClick={signOut}
          className="mx-3 mb-4 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted-foreground hover:bg-sidebar-accent/50 hover:text-destructive transition"
        >
          <LogOut className="h-4 w-4" /> Esci
        </button>
      </aside>

      {/* Mobile top bar */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="lg:hidden sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
          <div className="flex items-center justify-between px-4 py-3">
            <Link to="/dashboard" className="flex items-center gap-2">
              <BrandLogo size="sm" />
            </Link>
            <button onClick={signOut} className="text-muted-foreground p-2">
              <LogOut className="h-5 w-5" />
            </button>
          </div>
          <nav className="flex gap-1 px-2 pb-2 overflow-x-auto">
            {nav.map((item) => {
              const active = pathname.startsWith(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs whitespace-nowrap ${
                    active
                      ? "bg-primary text-primary-foreground font-medium"
                      : "text-muted-foreground bg-card"
                  }`}
                >
                  <item.icon className="h-3.5 w-3.5" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </header>

        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
