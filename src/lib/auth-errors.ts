// Mappa centralizzata degli errori di autenticazione in italiano.
// Non mostrare mai all'utente le stringhe grezze in inglese del provider.

const FALLBACK = "Accesso non riuscito. Riprova tra poco.";

const AUTH_ERROR_MAP: Array<[RegExp, string]> = [
  [/invalid login credentials/i, "Email o password non corretti."],
  [/email not confirmed/i, "Devi prima confermare la tua email: controlla la casella di posta."],
  [/user already registered|already been registered/i, "Esiste già un account con questa email. Prova ad accedere."],
  [/password.*(at least|too short|weak)|weak_password/i, "Password troppo debole: usa almeno 6 caratteri."],
  [/too many requests|rate limit|over_request_rate_limit|over_email_send_rate_limit/i, "Troppi tentativi. Attendi qualche minuto e riprova."],
  [/email.*(invalid|not valid)|invalid.*email/i, "L'indirizzo email non sembra valido."],
  [/signup.*disabled|signups.*disabled/i, "Le registrazioni sono temporaneamente sospese. Riprova più tardi."],
  [/email link.*(invalid|expired)|otp.*(invalid|expired)|token.*(invalid|expired)/i, "Il link non è più valido o è scaduto. Richiedine uno nuovo."],
  [/same password/i, "La nuova password deve essere diversa da quella attuale."],
  [/session.*(missing|expired|not found)|refresh token/i, "Sessione scaduta. Accedi di nuovo."],
  [/failed to fetch|network|fetch failed|load failed|networkerror/i, "Connessione assente o instabile. Controlla la rete e riprova."],
  [/provider.*disabled|unsupported provider/i, "Accesso con questo provider non disponibile al momento."],
];

/** Converte un errore auth (Supabase o di rete) in un messaggio italiano chiaro. */
export function authErrorMessage(err: unknown, fallback: string = FALLBACK): string {
  const raw =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : "";
  if (!raw) return fallback;
  for (const [pattern, message] of AUTH_ERROR_MAP) {
    if (pattern.test(raw)) return message;
  }
  // Errore non riconosciuto: non esporre la stringa originale (spesso in inglese).
  return fallback;
}
