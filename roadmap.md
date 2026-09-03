# UEradar roadmap

## In progress
- [ ] Fix homepage #sicurezza UX: add real trust section, move CTA to #attiva (src/routes/index.tsx)

## Backlog (audit findings)
- [ ] Apply `isRealOpenAvviso` guard on bando detail route
- [ ] Add invite email delivery and `/invito` acceptance route
- [ ] EntitlementGate: distinguish network errors from no subscription
- [ ] Dossier timeout: invalidate usage summary on timeout branch
- [ ] Align offline feed cache max age with server cache (7 days)
- [ ] Filter empty requisiti rows in dossier
- [ ] Truncate long URLs in generated PDF
- [ ] Distinguish PDF/modulistica error messages
- [ ] Clear React Query cache on sign-out
- [ ] Verify removeCompanyMember hard-deletes member row for re-invite
- [ ] Alert on unhandled Stripe webhook event types
- [ ] Log/alert when feed admits via CORE_ATTESTED_SOURCE
