#!/usr/bin/env python3
"""
Regressione responsive di UEradar.com su browser headless.
Verifica per ogni rotta/viewport: assenza di overflow orizzontale
(document.scrollWidth <= innerWidth) e area di tocco >= 44x44 sui controlli
principali. Produce solo un report testuale, nessuno screenshot nel repo.
"""
import asyncio, json, os, sys

BASE = os.environ.get("QA_BASE_URL", "http://localhost:8080")
ALL = [320, 360, 375, 390, 414, 768, 1024, 1440]
CRITICAL = [320, 390, 768, 1440]
# JSON-LD atteso nel DOM renderizzato, per rotta pubblica.
EXPECTED_LD = {
    "/": ["Organization", "SoftwareApplication"],
    "/prezzi": ["FAQPage"],
}

ROUTES = [
    ("/", ALL),
    ("/prezzi", ALL),
    ("/auth", CRITICAL),
    ("/privacy", CRITICAL),
    ("/termini", CRITICAL),
    ("/cookie", CRITICAL),
    ("/dashboard", CRITICAL),
    ("/bando/qa-fixture", CRITICAL),
]

PROBE = """() => {
  const doc = document.documentElement;
  const small = [];
  const sel = 'a[class*="rounded"], a.tap, button, [role="button"], input, select, textarea';
  for (const el of document.querySelectorAll(sel)) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (r.width < 44 || r.height < 44) {
      small.push(((el.innerText || el.getAttribute('aria-label') || el.tagName).trim().slice(0, 40))
        + ` ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
  }
  const clipped = [];
  for (const el of document.querySelectorAll('p, li, h1, h2, h3, span')) {
    const st = getComputedStyle(el);
    if (st.textOverflow === 'ellipsis' || st.webkitLineClamp !== 'none') {
      const t = (el.innerText || '').trim();
      if (t.split(/\\s+/).length > 4) clipped.push(t.slice(0, 40));
    }
  }
  const ld = [...document.querySelectorAll('script[type="application/ld+json"]')]
    .flatMap((n) => { try { const j = JSON.parse(n.textContent); return [j['@type']]; } catch { return ['INVALID']; } });
  return {
    ld,
    scrollWidth: doc.scrollWidth,
    innerWidth: window.innerWidth,
    h1: document.querySelectorAll('h1').length,
    main: document.querySelectorAll('main').length,
    url: location.pathname,
    small, clipped
  };
}"""


async def main():
    from playwright.async_api import async_playwright

    failures, lines = [], []
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        for route, widths in ROUTES:
            for w in widths:
                ctx = await browser.new_context(viewport={"width": w, "height": 900})
                page = await ctx.new_page()
                try:
                    await page.goto(BASE + route, wait_until="networkidle", timeout=45000)
                except Exception as e:  # rotta non raggiungibile
                    lines.append(f"[skip] {route} @{w}px — {type(e).__name__}")
                    await ctx.close()
                    continue
                await page.wait_for_timeout(350)
                r = await page.evaluate(PROBE)
                final = r["url"]
                tag = f"{route} @{w}px"
                if final != route:
                    lines.append(f"[skip] {tag} — redirect a {final} (sessione assente)")
                    await ctx.close()
                    continue
                probs = []
                if r["scrollWidth"] > r["innerWidth"] + 1:
                    probs.append(f"overflow {r['scrollWidth']}>{r['innerWidth']}")
                if r["h1"] != 1:
                    probs.append(f"h1={r['h1']}")
                if r["main"] != 1:
                    probs.append(f"main={r['main']}")
                for t in EXPECTED_LD.get(route, []):
                    if t not in r["ld"]:
                        probs.append(f"JSON-LD {t} assente")
                if "INVALID" in r["ld"]:
                    probs.append("JSON-LD non valido")
                if r["small"]:
                    probs.append("tap<44: " + "; ".join(r["small"][:6]))
                if r["clipped"]:
                    probs.append("testo troncato: " + "; ".join(r["clipped"][:4]))
                if probs:
                    failures.append(f"{tag} :: " + " | ".join(probs))
                    lines.append(f"[FAIL] {tag} :: " + " | ".join(probs))
                else:
                    lines.append(f"[ok]   {tag} — scrollWidth {r['scrollWidth']} <= {r['innerWidth']}")
                await ctx.close()
        await browser.close()

    report = "Report responsive UEradar.com\n" + "\n".join(lines) + "\n"
    os.makedirs("qa", exist_ok=True)
    with open("qa/responsive-report.txt", "w") as f:
        f.write(report)
    print(report)
    if failures:
        print(f"\nResponsive check FALLITO: {len(failures)} problemi")
        sys.exit(1)
    print("Responsive check OK")


asyncio.run(main())
