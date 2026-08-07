import { Link } from "@tanstack/react-router";
import { Radar } from "lucide-react";
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
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-5">
          <Link to="/" className="flex items-center gap-2 font-semibold">
            <Radar className="h-5 w-5 text-primary" /> UEradar.com
          </Link>
          <Link to="/auth" className="text-sm text-primary hover:underline">
            Accedi
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-6 py-12">
        <h1 className="text-3xl font-bold">{title}</h1>
        <p className="mt-2 text-xs text-muted-foreground">Ultimo aggiornamento: {updated}</p>
        <article className="mt-8 space-y-7 text-sm leading-7 text-muted-foreground">{children}</article>
      </main>
      <footer className="border-t border-border py-8 text-center text-xs text-muted-foreground">
        <Link to="/privacy" className="hover:text-foreground">Privacy</Link>
        {" · "}
        <Link to="/termini" className="hover:text-foreground">Termini</Link>
        {" · "}
        <Link to="/cookie" className="hover:text-foreground">Cookie</Link>
      </footer>
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
