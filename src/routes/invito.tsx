import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { BrandLogo } from "@/components/bandocore/BrandLogo";
import { SiteFooter } from "@/components/bandocore/SiteFooter";
import { seoHead } from "@/lib/seo";
import { INVITE_PATH, INVITE_TOKEN_QUERY, isInviteToken, safeAuthNext } from "@/lib/invite-email";
import { acceptCompanyInvite, getInviteByToken } from "@/lib/billing.functions";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/invito")({
  head: () => seoHead("/invito"),
  validateSearch: (search: Record<string, unknown>): { token?: string } => {
    const raw = search[INVITE_TOKEN_QUERY];
    return isInviteToken(raw) ? { token: raw.trim() } : {};
  },
  component: InvitoPage,
});

function InvitoPage() {
  const navigate = useNavigate();
  const { token } = Route.useSearch();
  const loadInvite = useServerFn(getInviteByToken);
  const accept = useServerFn(acceptCompanyInvite);
  const [userId, setUserId] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setUserId(data.session?.user.id ?? null);
      setAuthReady(true);
    });
  }, []);

  const inviteQuery = useQuery({
    queryKey: ["public-invite", token],
    enabled: Boolean(token),
    queryFn: () => loadInvite({ data: { token: token! } }),
  });

  const acceptMutation = useMutation({
    mutationFn: (member_id: string) => accept({ data: { member_id } }),
    onSuccess: (res) => {
      if (!res.ok) {
        const messages: Record<string, string> = {
          ALREADY_MEMBER_OF_ANOTHER_COMPANY: "Il tuo account è già associato a un'altra impresa",
          ALREADY_MEMBER: "Il tuo account è già associato a un'altra impresa",
          PERSONAL_SUBSCRIPTION_MUST_BE_MANAGED:
            "Hai un abbonamento personale attivo: gestiscilo o disdicilo dal portale di fatturazione prima di accettare l'invito",
          EMAIL_NOT_VERIFIABLE: "Email dell'account non verificabile",
          INVITE_EMAIL_MISMATCH: "L'invito è associato a un'altra email",
          INVITE_ACCEPT_FAILED: "Accettazione non completata: nessuna modifica applicata, riprova",
        };
        toast.error(messages[res.code] ?? "Invito non disponibile");
        return;
      }
      toast.success("Invito accettato");
      navigate({ to: "/dashboard" });
    },
    onError: () => toast.error("Accettazione non completata: nessuna modifica applicata"),
  });

  const invite = inviteQuery.data?.invite ?? null;
  const next = token ? safeAuthNext(`${INVITE_PATH}?${INVITE_TOKEN_QUERY}=${token}`) : null;

  return (
    <div className="safe-x safe-top safe-bottom min-h-dvh bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-xl items-center justify-between gap-3 px-4 py-4">
          <Link to="/" className="flex items-center" aria-label="UEradar.com, home">
            <BrandLogo size="sm" />
          </Link>
          <nav aria-label="Accesso area riservata">
            <Link to="/auth" className="tap text-sm font-medium text-primary hover:underline">
              Accedi
            </Link>
          </nav>
        </div>
      </header>
      <main id="contenuto-principale" className="mx-auto max-w-xl px-4 py-10">
        <nav aria-label="Ritorno al sito pubblico" className="mb-6">
          <Link
            to="/"
            className="tap inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft aria-hidden="true" className="h-4 w-4" /> Home
          </Link>
        </nav>
        <h1 className="text-2xl font-bold sm:text-3xl">Invito all'impresa</h1>
        {!token ? (
          <p className="mt-4 text-sm text-muted-foreground">
            Questo link non è completo. Chiedi al titolare di inviarti di nuovo l'invito.
          </p>
        ) : inviteQuery.isLoading || !authReady ? (
          <p className="mt-4 text-sm text-muted-foreground">Verifica dell'invito in corso…</p>
        ) : !invite ? (
          <p className="mt-4 text-sm text-muted-foreground">
            Invito non disponibile: è scaduto, è già stato accettato oppure il link non è valido.
          </p>
        ) : (
          <div className="mt-4 space-y-4 text-sm">
            <p>
              Sei stato invitato come utente operativo
              {invite.declared_role ? ` (${invite.declared_role})` : ""}.
              {invite.first_name || invite.last_name
                ? ` L'invito è nominativo per ${[invite.first_name, invite.last_name]
                    .filter(Boolean)
                    .join(" ")}.`
                : ""}
            </p>
            <p className="text-muted-foreground">
              Accetta con lo stesso account email a cui è stato inviato l'invito. UEradar.com non
              inventa Bandi e non invia domande agli enti.
            </p>
            {userId ? (
              <button
                type="button"
                onClick={() => acceptMutation.mutate(invite.id)}
                disabled={acceptMutation.isPending}
                className="tap rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              >
                Accetta invito con questo account
              </button>
            ) : (
              <Link
                to="/auth"
                search={next ? { next } : {}}
                className="tap inline-flex rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
              >
                Accedi o registrati per accettare
              </Link>
            )}
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
