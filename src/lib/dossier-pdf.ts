import { DOSSIER_DISCLAIMER, TRIAL_WATERMARK, type Dossier } from "./dossier";

export interface PdfBlock {
  kind: "title" | "heading" | "note" | "text";
  text: string;
}

/** Modello impaginabile del PDF: puro e testabile, nessun accesso al browser. */
export function dossierPdfModel(d: Dossier, watermarked = false): PdfBlock[] {
  const blocks: PdfBlock[] = [
    ...(watermarked ? [{ kind: "note" as const, text: TRIAL_WATERMARK }] : []),
    { kind: "title", text: "Dossier candidatura (bozza) — UEradar.com" },
    { kind: "note", text: DOSSIER_DISCLAIMER },
    { kind: "text", text: `Riferimento interno: ${d.bando_id}` },
    { kind: "text", text: `Completezza dossier: ${d.readiness}` },
    { kind: "heading", text: "Copertina" },
    ...d.cover.map((f) => ({ kind: "text" as const, text: `${f.label}: ${f.value}` })),
    { kind: "heading", text: "Sintesi economica" },
    ...d.economics.map((f) => ({ kind: "text" as const, text: `${f.label}: ${f.value}` })),
    { kind: "heading", text: "Compatibilità profilo" },
    {
      kind: "text",
      text: `Stato: ${d.compatibility.label}${d.compatibility.score !== null ? ` (${d.compatibility.score}%)` : ""}`,
    },
    ...d.compatibility.confirmed.map((x) => ({ kind: "text" as const, text: `Confermato: ${x}` })),
    ...d.compatibility.blockers.map((x) => ({ kind: "text" as const, text: `Blocker: ${x}` })),
    ...d.compatibility.to_check.map((x) => ({ kind: "text" as const, text: `Da verificare: ${x}` })),
    { kind: "heading", text: "Checklist requisiti" },
    ...(d.requirements.length
      ? d.requirements.map((r, i) => ({ kind: "text" as const, text: `${i + 1}. ${r}` }))
      : [{ kind: "text" as const, text: "Requisiti non disponibili: verificare sulla fonte ufficiale." }]),
    { kind: "heading", text: "Checklist documenti (suggerita / da verificare)" },
    {
      kind: "note",
      text: "Elenco suggerito sulla base dei dati disponibili: non sostituisce l'elenco ufficiale del bando.",
    },
    ...d.documents.map((doc, i) => ({ kind: "text" as const, text: `${i + 1}. ${doc.label} — ${doc.reason}` })),
    { kind: "heading", text: "Timeline operativa" },
    ...d.timeline.map((s) => ({
      kind: "text" as const,
      text: `${s.date ? `${s.date} — ` : ""}${s.label}: ${s.note}`,
    })),
    { kind: "heading", text: "Canale ufficiale" },
    ...d.channel.map((f) => ({ kind: "text" as const, text: `${f.label}: ${f.value}` })),
  ];

  if (d.rarity.poco_diffusa) {
    blocks.push({ kind: "heading", text: "Fonte poco diffusa" });
    blocks.push({
      kind: "text",
      text: `Tipo fonte: ${d.rarity.source_kind ?? "documento ufficiale"}${
        d.rarity.rarity_score ? ` · indice diffusione ${d.rarity.rarity_score}/5` : ""
      }`,
    });
    if (d.rarity.note) blocks.push({ kind: "text", text: `Nota: ${d.rarity.note}` });
  }

  if (d.evidence.length) {
    blocks.push({ kind: "heading", text: "Prove e fonti ufficiali" });
    for (const e of d.evidence) blocks.push({ kind: "text", text: `${e.title} (${e.type}): ${e.url}` });
  }

  blocks.push({ kind: "heading", text: "Testo istanza / lettera di accompagnamento" });
  for (const line of d.cover_letter.split("\n")) blocks.push({ kind: "text", text: line });

  blocks.push({ kind: "heading", text: "Dati mancanti prima dell'uso" });
  if (d.missing_before_use.length) {
    for (const m of d.missing_before_use) blocks.push({ kind: "text", text: `• ${m}` });
  } else {
    blocks.push({ kind: "text", text: "Nessun dato mancante rilevato automaticamente." });
  }

  blocks.push({ kind: "note", text: DOSSIER_DISCLAIMER });
  if (watermarked) blocks.push({ kind: "note", text: TRIAL_WATERMARK });
  return blocks;
}

/**
 * Genera e scarica il PDF interamente nel browser: nessun dato lascia il dispositivo.
 */
export async function downloadDossierPdf(
  d: Dossier,
  fileName: string,
  watermarked = false,
): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const marginX = 18;
  const marginTop = 20;
  const marginBottom = 20;
  const pageHeight = doc.internal.pageSize.getHeight();
  const width = doc.internal.pageSize.getWidth() - marginX * 2;
  let y = marginTop;

  const ensure = (needed: number) => {
    if (y + needed > pageHeight - marginBottom) {
      doc.addPage();
      y = marginTop;
    }
  };

  for (const b of dossierPdfModel(d, watermarked)) {
    if (b.kind === "title") {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
    } else if (b.kind === "heading") {
      y += 3;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
    } else if (b.kind === "note") {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(9);
    } else {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
    }
    const lineHeight = b.kind === "title" ? 8 : b.kind === "heading" ? 6 : 5;
    const lines: string[] = doc.splitTextToSize(b.text || " ", width);
    for (const line of lines) {
      ensure(lineHeight);
      doc.text(line, marginX, y);
      y += lineHeight;
    }
    y += b.kind === "text" ? 0.5 : 2;
  }

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    if (watermarked) {
      // Filigrana su ogni pagina: l'anteprima della prova non è presentabile.
      doc.setFont("helvetica", "bold");
      doc.setFontSize(28);
      doc.setTextColor(200, 200, 200);
      doc.text("ANTEPRIMA PROVA GRATUITA", marginX, pageHeight / 2, { angle: 30 });
      doc.setTextColor(0, 0, 0);
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(
      `UEradar.com — bozza informativa, non inviata${
        watermarked ? " — ANTEPRIMA PROVA GRATUITA FILIGRANATA" : ""
      } — pagina ${i}/${pages}`,
      marginX,
      pageHeight - 10,
    );
  }

  doc.save(fileName);
}
