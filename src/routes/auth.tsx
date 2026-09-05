import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Mail, Lock, ArrowLeft, Eye, EyeOff } from "lucide-react";
import { BrandLogo } from "@/components/bandocore/BrandLogo";
import { SiteFooter } from "@/components/bandocore/SiteFooter";
import { seoHead } from "@/lib/seo";
import { TRIAL_HIGHLIGHT } from "@/lib/coverage";
import { toast } from "sonner";
import { authErrorMessage } from "@/lib/auth-errors";
import { safeAuthNext } from "@/lib/invite-email";

export const Route = createFileRoute("/auth")({
  head: () => seoHead("/auth"),
  validateSearch: (search: Record<string, unknown>): { next?: string } => {
    const next = safeAuthNext(search["next"]);
    return next ? { next } : {};
  },
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { next } = Route.useSearch();
  const [mode, setMode] = useState<"signin" | "signup">("signin");

  const goAfterAuth = () => {
    if (next) {
      const token = new URL(next, window.location.origin).searchParams.get("token");
      if (token) {
        navigate({ to: "/invito", search: { token }, replace: true });
        return;
      }
    }
    navigate({ to: "/dashboard", replace: true });
  };
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) goAfterAuth();
    });
  }, [navigate, next]);

  const handleGoogle = async () => {
    setLoading(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri:
        window.location.origin + "/auth" + (next ? `?next=${encodeURIComponent(next)}` : ""),
    });
    if (result.error) {
      toast.error("Accesso Google non riuscito");
      setLoading(false);
      return;
    }
    if (!result.redirected) {
      goAfterAuth();
    }
  };

  const handleEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    // Validazione in italiano prima di chiamare il provider: mai un invio muto.
    const emailTrim = email.trim();
    if (!emailTrim) {
      toast.error("Inserisci la tua email.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(emailTrim)) {
      toast.error("L'indirizzo email non sembra valido.");
      return;
    }
    if (!password) {
      toast.error("Inserisci la password.");
      return;
    }
    if (mode === "signup" && password.length < 8) {
      toast.error("La password deve avere almeno 8 caratteri.");
      return;
    }
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email: emailTrim,
          password,
          options: {
            emailRedirectTo:
              window.location.origin + "/auth" + (next ? `?next=${encodeURIComponent(next)}` : ""),
            data: {
              ueradar_trial_days: 7,
              terms_accepted_at: new Date().toISOString(),
              terms_version: "2026-08-07",
            },
          },
        });
        if (error) throw error;
        toast.success("Registrazione completata. Verifica la mail se richiesto.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: emailTrim, password });
        if (error) throw error;
      }
      const { data } = await supabase.auth.getSession();
      if (data.session) goAfterAuth();
    } catch (err) {
      toast.error(authErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    const trimmed = email.trim();
    if (!trimmed) {
      toast.error("Inserisci l'email per recuperare la password");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(trimmed, {
        redirectTo: window.location.origin + "/auth",
      });
      if (error) throw error;
      toast.success("Se l'account esiste, riceverai una email per reimpostare la password");
    } catch (err) {
      toast.error(authErrorMessage(err, "Recupero password non riuscito. Riprova tra poco."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="safe-x safe-top safe-bottom min-h-dvh grid lg:grid-cols-2">
      <header className="hidden lg:flex flex-col justify-between gradient-hero p-12 relative overflow-hidden">
        <div className="absolute -top-32 -right-32 h-96 w-96 rounded-full bg-primary/20 blur-3xl" />
        <nav aria-label="Ritorno al sito pubblico" className="relative">
          <Link
            to="/"
            className="tap inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft aria-hidden="true" className="h-4 w-4" /> Torna alla home
          </Link>
        </nav>
        <div className="relative">
          <BrandLogo />
          <h2 className="mt-6 text-4xl font-bold leading-tight">
            Il Radar dei Bandi
            <br />
            per la tua Impresa.
          </h2>
          <p className="mt-4 text-muted-foreground max-w-md">
            Accedi per configurare il Profilo Aziendale e ricevere Bandi filtrati su ATECO, sede
            legale e forma giuridica.
          </p>
        </div>
        <p className="relative text-xs text-muted-foreground">© UEradar.com · Servizio B2B</p>
      </header>

      <main id="contenuto-principale" className="flex items-center justify-center p-5 sm:p-8">
        <div className="w-full max-w-md">
          <nav aria-label="Ritorno al sito pubblico" className="lg:hidden mb-8">
            <Link
              to="/"
              className="tap inline-flex items-center gap-2 text-sm text-muted-foreground"
            >
              <ArrowLeft aria-hidden="true" className="h-4 w-4" /> Home
            </Link>
          </nav>
          <h1 className="text-3xl font-bold">
            {mode === "signin" ? "Bentornato" : "Attiva UEradar.com"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {mode === "signin" ? "Accedi al tuo Radar Bandi." : TRIAL_HIGHLIGHT}
          </p>

          <button
            onClick={handleGoogle}
            disabled={loading}
            className="tap mt-8 w-full inline-flex items-center justify-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm font-medium transition hover:bg-surface-elevated disabled:opacity-50"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Continua con Google
          </button>

          <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-border" /> oppure{" "}
            <div className="h-px flex-1 bg-border" />
          </div>

          <form onSubmit={handleEmail} noValidate className="space-y-4">
            <div>
              <label htmlFor="email" className="text-xs font-medium text-muted-foreground">
                Email
              </label>
              <div className="mt-1 relative">
                <Mail
                  aria-hidden="true"
                  className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
                />
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-border bg-input pl-10 pr-3 py-3 text-base focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="tu@azienda.it"
                />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between gap-2">
                <label htmlFor="password" className="text-xs font-medium text-muted-foreground">
                  Password
                </label>
                {mode === "signin" ? (
                  <button
                    type="button"
                    onClick={handleForgotPassword}
                    disabled={loading}
                    className="tap text-xs font-medium text-primary hover:underline disabled:opacity-50"
                  >
                    Password dimenticata?
                  </button>
                ) : null}
              </div>
              <div className="mt-1 relative">
                <Lock
                  aria-hidden="true"
                  className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
                />
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  required
                  minLength={mode === "signin" ? 6 : 8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-border bg-input pl-10 pr-11 py-3 text-base focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder={mode === "signin" ? "Minimo 6 caratteri" : "Minimo 8 caratteri"}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="tap absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground hover:text-foreground"
                  aria-label={showPassword ? "Nascondi password" : "Mostra password"}
                  aria-pressed={showPassword}
                >
                  {showPassword ? (
                    <EyeOff aria-hidden="true" className="h-4 w-4" />
                  ) : (
                    <Eye aria-hidden="true" className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
            <button
              disabled={loading}
              className="tap w-full rounded-lg bg-primary py-3 text-sm font-semibold text-primary-foreground shadow-glow transition hover:brightness-110 disabled:opacity-50"
            >
              {loading ? "Attendi…" : mode === "signin" ? "Accedi" : "Crea account"}
            </button>
          </form>

          <p className="mt-4 text-center text-xs text-muted-foreground">
            Continuando accetti i{" "}
            <Link to="/termini" className="text-primary hover:underline">
              Termini
            </Link>
            {" e l'"}
            <Link to="/privacy" className="text-primary hover:underline">
              informativa privacy
            </Link>
            . La prova gratuita non genera addebiti automatici.
          </p>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            {mode === "signin" ? "Non hai un account?" : "Hai già un account?"}{" "}
            <button
              onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
              className="tap inline-flex items-center text-primary font-medium hover:underline"
            >
              {mode === "signin" ? "Registrati" : "Accedi"}
            </button>
          </p>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
