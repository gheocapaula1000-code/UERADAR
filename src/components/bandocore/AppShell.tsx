import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { LayoutDashboard, Building2, CreditCard, LogOut } from "lucide-react";
import { BrandLogo } from "@/components/bandocore/BrandLogo";
import { SiteFooter } from "@/components/bandocore/SiteFooter";
import { EntitlementGate } from "@/components/bandocore/EntitlementGate";
import { BottomNav } from "@/components/bandocore/BottomNav";
import { PullToRefresh } from "@/components/bandocore/PullToRefresh";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { ReactNode } from "react";

export function AppShell({
  children,
  requireEntitlement = true,
}: {
  children: ReactNode;
  /** false solo per le pagine che devono restare raggiungibili senza abbonamento. */
  requireEntitlement?: boolean;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const signOut = async () => {
    await supabase.auth.signOut();
    queryClient.clear();
    toast.success("Sessione chiusa");
    navigate({ to: "/auth", replace: true });
  };

  const nav = [
    { to: "/dashboard", label: "Radar Bandi", icon: LayoutDashboard },
    { to: "/profilo", label: "Profilo Azienda", icon: Building2 },
    { to: "/abbonamento", label: "Abbonamento", icon: CreditCard },
  ] as const;

  return (
    <div className="h-dvh max-w-full bg-background text-foreground flex overflow-hidden overflow-x-clip">
      {/* Sidebar desktop */}
      <aside
        aria-label="Navigazione area riservata"
        className="safe-top safe-bottom hidden lg:flex w-64 flex-col border-r border-border bg-sidebar shrink-0"
      >
        <Link
          to="/dashboard"
          className="flex items-center gap-2 px-6 py-6 border-b border-sidebar-border"
        >
          <BrandLogo />
        </Link>
        <nav aria-label="Sezioni principali" className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {nav.map((item) => {
            const active = pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`tap flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${
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
          className="tap mx-3 mb-4 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted-foreground hover:bg-sidebar-accent/50 hover:text-destructive transition"
        >
          <LogOut className="h-4 w-4" /> Esci
        </button>
      </aside>

      {/* Colonna mobile/desktop: altezza fissa, scroll solo nel PTR */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
        <header className="safe-x safe-top lg:hidden sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur shrink-0">
          <div className="flex items-center justify-between px-4 py-3">
            <Link to="/dashboard" className="flex items-center gap-2">
              <BrandLogo size="sm" />
            </Link>
            <button
              onClick={signOut}
              aria-label="Esci dall'area riservata"
              className="tap inline-flex items-center justify-center text-muted-foreground p-2"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </header>

        <PullToRefresh>
          <main
            id="contenuto-principale"
            className="safe-x min-w-0 max-w-full overflow-x-clip pb-24 lg:pb-10"
          >
            {requireEntitlement ? <EntitlementGate>{children}</EntitlementGate> : children}
          </main>
          <div className="bottom-nav-gap">
            <SiteFooter />
          </div>
        </PullToRefresh>
        <BottomNav />
      </div>
    </div>
  );
}
