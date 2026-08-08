/**
 * Catalogo UEradar: fonte unica di verità server-side per piani, prezzi,
 * capienza utenti e limiti operativi. La UI legge da qui e non duplica mai
 * prezzi o limiti. Nessun Price ID è hardcoded: solo i nomi delle env TEST.
 *
 * Tutti gli importi sono IVA esclusa. L'annuale include 2 mesi (10 x mensile).
 * Il numero di utenti è solo capienza tecnica, non la leva di valore.
 */
export type PlanId = "trial" | "professional" | "business" | "executive" | "enterprise";
export type BillingInterval = "month" | "year";

/**
 * Categorie di fonti ufficiali. Oggi il motore espone un solo set di fonti
 * verificabile per tutti i piani: `AVAILABLE_SOURCE_TIER`. Finché la
 * classificazione per livello non è affidabile alla fonte, nessun piano
 * dichiara o riceve una copertura diversa (fail-closed).
 */
export const SOURCE_TIERS = {
  core: "Fonti ufficiali pubbliche disponibili nel motore",
  extended: "Fonti ufficiali pubbliche disponibili nel motore",
  dedicated: "Fonti e integrazioni definite da contratto",
} as const;

/** Unico livello di fonti realmente servito e verificabile oggi. */
/** Obiettivi di investimento ammessi durante la prova gratuita. */
export const TRIAL_OBJECTIVES = 2;

export const AVAILABLE_SOURCE_TIER: keyof typeof SOURCE_TIERS = "core";

export type PlanLimits = {
  /** Utenti operativi: capienza tecnica del piano. */
  seats: number;
  /** Imprese gestibili. Oltre 1 solo su contratto Enterprise. */
  companies: number;
  /** Obiettivi di investimento selezionabili nel profilo. -1 = nessun limite. */
  objectives: number;
  /** Verifiche approfondite incluse ogni mese. -1 = definito da contratto. */
  deepVerificationsPerMonth: number;
  /** Dossier candidatura preparabili ogni mese. -1 = definito da contratto. */
  dossiersPerMonth: number;
  /** Intervallo minimo tra due ricerche complete (minuti). */
  fullSearchIntervalMinutes: number;
  /** Corsia urgente: intervallo minimo in minuti, null se non inclusa. */
  urgentLaneIntervalMinutes: number | null;
  sourceTier: keyof typeof SOURCE_TIERS;
  crossVerification: boolean;
  changeMonitoring: boolean;
  apiAccess: boolean;
  exportsEnabled: boolean;
  /** Il dossier del periodo di prova è una anteprima filigranata. */
  watermarkedDossier: boolean;
};

export type PlanPrice = {
  interval: BillingInterval;
  amountCents: number;
  /** Nome della variabile d'ambiente TEST che contiene il Price ID. */
  priceEnv: string;
  planCode: string;
};

export type PlanDefinition = {
  id: PlanId;
  name: string;
  audience: string;
  /** Checkout pubblico self-service disponibile. */
  selfService: boolean;
  highlighted: boolean;
  prices: Partial<Record<BillingInterval, PlanPrice>>;
  limits: PlanLimits;
  /** Punti di valore mostrati nelle card. Nessun numero grezzo di opportunità. */
  highlights: readonly string[];
};

const NO_LIMITS_NOTE = "Le opportunità pertinenti mostrate non sono mai limitate.";

export const CATALOG: Record<PlanId, PlanDefinition> = {
  trial: {
    id: "trial",
    name: "PROVA GRATUITA",
    audience: "7 giorni per valutare UEradar senza alcun pagamento",
    selfService: false,
    highlighted: false,
    prices: {},
    limits: {
      seats: 1,
      companies: 1,
      objectives: TRIAL_OBJECTIVES,
      deepVerificationsPerMonth: 5,
      dossiersPerMonth: 1,
      fullSearchIntervalMinutes: 120,
      urgentLaneIntervalMinutes: 15,
      sourceTier: AVAILABLE_SOURCE_TIER,
      crossVerification: false,
      changeMonitoring: false,
      apiAccess: false,
      exportsEnabled: true,
      watermarkedDossier: true,
    },
    highlights: [
      "Livello Business per 7 giorni",
      "1 impresa, 1 utente, 2 obiettivi",
      "1 anteprima dossier filigranata",
      NO_LIMITS_NOTE,
    ],
  },
  professional: {
    id: "professional",
    name: "PROFESSIONAL",
    audience: "Per una impresa che vuole presidio costante e ordinato",
    selfService: true,
    highlighted: false,
    prices: {
      month: {
        interval: "month",
        amountCents: 49900,
        priceEnv: "STRIPE_PRICE_PROFESSIONAL_MONTHLY_TEST",
        planCode: "ueradar_professional_monthly",
      },
      year: {
        interval: "year",
        amountCents: 499000,
        priceEnv: "STRIPE_PRICE_PROFESSIONAL_ANNUAL_TEST",
        planCode: "ueradar_professional_annual",
      },
    },
    limits: {
      seats: 2,
      companies: 1,
      objectives: -1,
      deepVerificationsPerMonth: 25,
      dossiersPerMonth: 1,
      fullSearchIntervalMinutes: 720,
      urgentLaneIntervalMinutes: null,
      sourceTier: AVAILABLE_SOURCE_TIER,
      crossVerification: false,
      changeMonitoring: false,
      apiAccess: false,
      exportsEnabled: true,
      watermarkedDossier: false,
    },
    highlights: [
      "Aggiornamenti programmati sul profilo impresa",
      SOURCE_TIERS[AVAILABLE_SOURCE_TIER],
      "Checklist domanda e 1 dossier al mese",
      "2 utenti operativi (capienza tecnica)",
      NO_LIMITS_NOTE,
    ],
  },
  business: {
    id: "business",
    name: "BUSINESS",
    audience: "Per chi non può permettersi di scoprire un bando in ritardo",
    selfService: true,
    highlighted: true,
    prices: {
      month: {
        interval: "month",
        amountCents: 99000,
        priceEnv: "STRIPE_PRICE_BUSINESS_MONTHLY_TEST",
        planCode: "ueradar_business_monthly",
      },
      year: {
        interval: "year",
        amountCents: 990000,
        priceEnv: "STRIPE_PRICE_BUSINESS_ANNUAL_TEST",
        planCode: "ueradar_business_annual",
      },
    },
    limits: {
      seats: 5,
      companies: 1,
      objectives: -1,
      deepVerificationsPerMonth: 100,
      dossiersPerMonth: 5,
      fullSearchIntervalMinutes: 120,
      urgentLaneIntervalMinutes: 15,
      sourceTier: AVAILABLE_SOURCE_TIER,
      crossVerification: false,
      changeMonitoring: false,
      apiAccess: false,
      exportsEnabled: true,
      watermarkedDossier: false,
    },
    highlights: [
      "Aggiornamenti programmati più frequenti",
      SOURCE_TIERS[AVAILABLE_SOURCE_TIER],
      "5 dossier al mese",
      "5 utenti operativi (capienza tecnica)",
      NO_LIMITS_NOTE,
    ],
  },
  executive: {
    id: "executive",
    name: "EXECUTIVE",
    audience: "Per chi gestisce più dossier in parallelo e vuole controllo continuo",
    selfService: true,
    highlighted: false,
    prices: {
      month: {
        interval: "month",
        amountCents: 199000,
        priceEnv: "STRIPE_PRICE_EXECUTIVE_MONTHLY_TEST",
        planCode: "ueradar_executive_monthly",
      },
      year: {
        interval: "year",
        amountCents: 1990000,
        priceEnv: "STRIPE_PRICE_EXECUTIVE_ANNUAL_TEST",
        planCode: "ueradar_executive_annual",
      },
    },
    limits: {
      seats: 10,
      companies: 1,
      objectives: -1,
      deepVerificationsPerMonth: 300,
      dossiersPerMonth: 15,
      fullSearchIntervalMinutes: 60,
      urgentLaneIntervalMinutes: 5,
      sourceTier: AVAILABLE_SOURCE_TIER,
      crossVerification: false,
      changeMonitoring: false,
      apiAccess: false,
      exportsEnabled: true,
      watermarkedDossier: false,
    },
    highlights: [
      "Aggiornamenti programmati alla massima frequenza prevista",
      SOURCE_TIERS[AVAILABLE_SOURCE_TIER],
      "15 dossier al mese",
      "10 utenti operativi (capienza tecnica)",
      NO_LIMITS_NOTE,
    ],
  },
  enterprise: {
    id: "enterprise",
    name: "ENTERPRISE",
    audience: "Più imprese e workflow definiti da contratto",
    selfService: false,
    highlighted: false,
    prices: {},
    limits: {
      seats: -1,
      companies: -1,
      objectives: -1,
      deepVerificationsPerMonth: -1,
      dossiersPerMonth: -1,
      fullSearchIntervalMinutes: 60,
      urgentLaneIntervalMinutes: 5,
      sourceTier: AVAILABLE_SOURCE_TIER,
      crossVerification: false,
      changeMonitoring: false,
      apiAccess: false,
      exportsEnabled: true,
      watermarkedDossier: false,
    },
    highlights: [
      "Più imprese sullo stesso contratto",
      SOURCE_TIERS.dedicated,
      "Workflow e limiti definiti da contratto",
    ],
  },
};

/** Piano di partenza dell'importo Enterprise, senza checkout pubblico. */
export const ENTERPRISE_FROM_CENTS = 399000;

export const PLAN_IDS = Object.keys(CATALOG) as PlanId[];

/** Piani acquistabili online: solo questi entrano nell'allowlist del checkout. */
export const SELF_SERVICE_PLANS = PLAN_IDS.filter((id) => CATALOG[id].selfService);

export function isPlanId(value: unknown): value is PlanId {
  return typeof value === "string" && (PLAN_IDS as string[]).includes(value);
}

export function isBillingInterval(value: unknown): value is BillingInterval {
  return value === "month" || value === "year";
}

/** Allowlist checkout: solo piani self-service con un prezzo definito per l'intervallo. */
export function checkoutTarget(plan: unknown, interval: unknown): PlanPrice | null {
  if (!isPlanId(plan) || !isBillingInterval(interval)) return null;
  const definition = CATALOG[plan];
  if (!definition.selfService) return null;
  return definition.prices[interval] ?? null;
}

export function planCodesFor(plan: PlanId): string[] {
  return Object.values(CATALOG[plan].prices).map((p) => p.planCode);
}

export const TRIAL_PLAN_CODE = "ueradar_trial";
export const ENTERPRISE_PLAN_CODE = "ueradar_enterprise";

export const ALL_PLAN_CODES: readonly string[] = [
  TRIAL_PLAN_CODE,
  ENTERPRISE_PLAN_CODE,
  ...PLAN_IDS.flatMap(planCodesFor),
];

/** Vecchi codici ancora presenti a database: mappati sul catalogo corrente. */
export const LEGACY_PLAN_CODES: Record<string, string> = {
  ueradar_pro_monthly: TRIAL_PLAN_CODE,
  ueradar_team_monthly: "ueradar_executive_monthly",
};

export function normalizePlanCode(value: unknown): string {
  if (typeof value !== "string" || !value) return TRIAL_PLAN_CODE;
  if (ALL_PLAN_CODES.includes(value)) return value;
  return LEGACY_PLAN_CODES[value] ?? TRIAL_PLAN_CODE;
}

export function planFromCode(value: unknown): PlanDefinition {
  const code = normalizePlanCode(value);
  if (code === ENTERPRISE_PLAN_CODE) return CATALOG.enterprise;
  for (const id of PLAN_IDS) if (planCodesFor(id).includes(code)) return CATALOG[id];
  return CATALOG.trial;
}

export function intervalFromCode(value: unknown): BillingInterval | null {
  const code = normalizePlanCode(value);
  for (const id of PLAN_IDS) {
    for (const price of Object.values(CATALOG[id].prices)) {
      if (price.planCode === code) return price.interval;
    }
  }
  return null;
}

/** Tutti i nomi delle env TEST attesi: nessun Price ID nel codice. */
export const PRICE_ENV_NAMES: readonly string[] = PLAN_IDS.flatMap((id) =>
  Object.values(CATALOG[id].prices).map((p) => p.priceEnv),
);

/** Formattazione italiana degli importi, sempre IVA esclusa. */
export function formatEuro(amountCents: number): string {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: amountCents % 100 === 0 ? 0 : 2,
  }).format(amountCents / 100);
}
