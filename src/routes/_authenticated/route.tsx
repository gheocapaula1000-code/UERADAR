import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (data.user) return { user: data.user };

    // Senza rete si può consultare soltanto lo snapshot locale già salvato.
    // La sessione locale non concede accesso a dati server e non sostituisce
    // la verifica JWT quando la rete è disponibile.
    if (error && typeof navigator !== "undefined" && !navigator.onLine) {
      const { data: local } = await supabase.auth.getSession();
      if (local.session?.user) return { user: local.session.user };
    }

    throw redirect({ to: "/auth" });
  },
  component: () => <Outlet />,
});
