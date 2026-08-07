import { Link } from "@tanstack/react-router";
import { BrandLogo } from "@/components/bandocore/BrandLogo";
import { SiteFooter } from "@/components/bandocore/SiteFooter";
import type { ReactNode } from "react";

export function LegalPage({
  title,
  updated = "7 agosto 2026",
  children,
}: {
  title: string;
  updated?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="safe-x safe-top border-b border-border">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-4 sm:px-6 sm:py-5">
          <Link to="/" className="flex min-w-0 items-center" aria-label="UEradar.com, home">
            <BrandLogo size="sm" />
          </Link>
          <nav aria-label="Accesso area riservata">
            <Link
              to="/auth"
              className="tap inline-flex items-center rounded-lg px-3 py-2 text-sm font-medium text-primary hover:underline"
            >
              Accedi
            </Link>
          </nav>
        </div>
      </header>
      <main
        id="contenuto-principale"
        className="safe-x mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-12"
      >
        <h1 className="text-2xl font-bold sm:text-3xl">{title}</h1>
        <p className="mt-2 text-xs text-muted-foreground">Ultimo aggiornamento: {updated}</p>
        <article className="mt-8 space-y-7 text-sm leading-7 text-muted-foreground">{children}</article>
      </main>
      <SiteFooter />
    </div>
  );
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      <div className="mt-2 space-y-3">{children}</div>
    </section>
  );
}
