import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { authErrorMessage } from "../auth-errors";

describe("errori di autenticazione in italiano", () => {
  it("traduce gli errori noti del provider senza esporre l'inglese", () => {
    const cases: Array<[unknown, string]> = [
      [new Error("Invalid login credentials"), "Email o password non corretti."],
      [
        new Error("Email not confirmed"),
        "Devi prima confermare la tua email: controlla la casella di posta.",
      ],
      [
        new Error("User already registered"),
        "Esiste già un account con questa email. Prova ad accedere.",
      ],
      [
        "Password should be at least 8 characters",
        "Password troppo debole: in registrazione servono almeno 8 caratteri (in accesso almeno 6).",
      ],
      [
        new Error("too many requests"),
        "Troppi tentativi. Attendi qualche minuto e riprova.",
      ],
      [new Error("invalid email"), "L'indirizzo email non sembra valido."],
      [
        new Error("Signups disabled"),
        "Le registrazioni sono temporaneamente sospese. Riprova più tardi.",
      ],
      [
        new Error("Token has expired or is invalid"),
        "Il link non è più valido o è scaduto. Richiedine uno nuovo.",
      ],
      [
        new Error("New password should not be the same password"),
        "La nuova password deve essere diversa da quella attuale.",
      ],
      [new Error("session missing"), "Sessione scaduta. Accedi di nuovo."],
      [
        new Error("Failed to fetch"),
        "Connessione assente o instabile. Controlla la rete e riprova.",
      ],
      [
        new Error("Unsupported provider"),
        "Accesso con questo provider non disponibile al momento.",
      ],
    ];
    for (const [err, expected] of cases) {
      const message = authErrorMessage(err);
      expect(message).toBe(expected);
      expect(message).not.toMatch(/invalid login|email not confirmed|failed to fetch/i);
    }
  });

  it("non espone stringhe grezze su errore sconosciuto o vuoto", () => {
    expect(authErrorMessage(new Error("INTERNAL_OAUTH_ERROR_XYZ"))).toBe(
      "Accesso non riuscito. Riprova tra poco.",
    );
    expect(authErrorMessage(null)).toBe("Accesso non riuscito. Riprova tra poco.");
    expect(authErrorMessage({}, "Recupero password non riuscito. Riprova tra poco.")).toBe(
      "Recupero password non riuscito. Riprova tra poco.",
    );
  });

  it("/auth usa la mappa italiana su accesso, registrazione e recupero password", () => {
    const auth = readFileSync("src/routes/auth.tsx", "utf8");
    expect(auth).toContain("authErrorMessage(err)");
    expect(auth).toContain(
      'authErrorMessage(err, "Recupero password non riuscito. Riprova tra poco.")',
    );
    expect(auth).toContain('toast.error("Inserisci la tua email.")');
    expect(auth).toContain('toast.error("La password deve avere almeno 8 caratteri.")');
    expect(auth).toContain("goAfterAuth");
    expect(auth).toContain('navigate({ to: "/dashboard", replace: true })');
  });
});
