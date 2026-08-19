# UEradar — 10 Specialized Scraping Agents (Core of the PWA)

Scraping is the **fulcro** of UEradar. The frontend PWA is thin; all discovery, extraction and verification run upstream in **Central Core** (Replit + trovabandi-engine).

This document defines the **exactly 10 mandatory agents** that must run on schedule. The orchestrator (Replit) coordinates them with rate limits, release_gate and verification statuses (`VERIFICATO` / `PARZIALE` / `DA_VERIFICARE`).

## Agent Roster (10)

| # | Agent ID | Responsibility | Primary Tools | Sources / Scope |
|---|----------|----------------|---------------|-----------------|
| 1 | **Agent-Local** | Albi Pretori, Comuni, GAL, avvisi comunali | Firecrawl | Comune + ISTAT code from profiles |
| 2 | **Agent-Camerale** | Camere di Commercio (CCIAA) bandi, voucher, avvisi | Firecrawl + Apify | Tutte le CCIAA regionali |
| 3 | **Agent-Regionale** | PR FESR / FSE+, bandi regionali, POR | Firecrawl + Perplexity | Regioni (priorità Veneto + altre con profilo) |
| 4 | **Agent-Nazionale** | Invitalia, MIMIT, ministeri, fondo perduto nazionali | Firecrawl + Perplexity | Portali ufficiali nazionali |
| 5 | **Agent-PNRR** | Missioni e componenti PNRR (separato da UE pura) | Firecrawl + Perplexity | Italia Domani, Agenzie PNRR |
| 6 | **Agent-UE** | Programmi UE diretti (Horizon Europe, Interreg, LIFE, COSME…) | Firecrawl + Perplexity | Funding & Tenders Portal, CORDIS |
| 7 | **Agent-Femminile** | Filtri dedicati imprenditoria femminile (>51% o amministratrice donna) | Perplexity + matching rules | Tutti i livelli, corsia preferenziale |
| 8 | **Agent-Giovanile** | Under-35, startup innovative, PMI innovative, impresa giovanile | Perplexity + matching | Tutti i livelli |
| 9 | **Agent-PDF** | Estrazione strutturata da PDF ufficiali e modulistica | Firecrawl (PDF) + OCR/structured | Qualsiasi fonte che pubblica solo PDF |
| 10 | **Agent-Dynamic** | Portali SPA, click-day, form dinamici, JS-heavy | Apify (actors) | Click-day, piattaforme di sottomissione |

## Orchestration Rules

1. **Nightly full discovery** (02:00 Europe/Rome): all 10 agents run in parallel (with concurrency limit).
2. **Daytime incremental** (every 4 h 08:00–20:00): Agents 1–6 + 9–10; Agents 7–8 re-score only.
3. Every opportunity must carry:
   - `authority_level` ∈ {COMUNALE, CAMERALE, REGIONALE, NAZIONALE, EU, EUROPEO}
   - `verification_status`
   - `trovabandi_evidence[]` (source_url + excerpt)
   - `match` object with status + score + confirmed/missing/blockers
4. **Release gate** (Central Core action `release_gate`) must return `ok: true`, `gate_passed: true`, `cron_activation_allowed: true` before any digest is allowed to run. Fail-closed.
5. Rate limits and polite crawling: respect robots.txt, max 1 req/s per domain, exponential backoff.

## Integration with PWA

- Edge `trovabandi-feed` and `trovabandi-digest` consume **only** the verified catalog produced by these agents.
- PWA never sees raw scrape; it receives sanitized, matched, admitted bandi.
- Offline cache + SW guarantee the PWA works even if Core is temporarily unreachable.

## Scaling to 16 (optional)

If load requires, add sector specialists after the core 10:
11. Digitalizzazione / Transizione 4.0  
12. Energia / Transizione green  
13. Agricoltura / Rurale  
14. Turismo / Cultura  
15. Internazionalizzazione  
16. Formazione / Occupazione  

Keep the original 10 always active; additional agents are additive only.

---
*This architecture is mandatory for UEradar to deliver the “Radar sempre acceso” promise without missing local or rare opportunities.*
