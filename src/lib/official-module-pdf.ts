import { TRIAL_WATERMARK } from "./dossier";
import type { OfficialFillPlan, PdfFormFieldInfo } from "./official-module";

/** Elenca i campi AcroForm senza scrivere nulla. */
export async function inspectOfficialPdf(bytes: Uint8Array): Promise<{
  fillable: boolean;
  fields: PdfFormFieldInfo[];
}> {
  const { PDFDocument, PDFTextField, PDFCheckBox, PDFRadioGroup, PDFDropdown, PDFButton, PDFSignature } =
    await import("pdf-lib");
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const form = doc.getForm();
  const fields: PdfFormFieldInfo[] = form.getFields().map((field) => {
    const name = field.getName();
    if (field instanceof PDFTextField) return { name, type: "text" };
    if (field instanceof PDFCheckBox) return { name, type: "checkbox" };
    if (field instanceof PDFRadioGroup) return { name, type: "radio" };
    if (field instanceof PDFDropdown) return { name, type: "dropdown" };
    if (field instanceof PDFSignature) return { name, type: "signature" };
    if (field instanceof PDFButton) return { name, type: "button" };
    return { name, type: "other" };
  });
  return { fillable: fields.some((field) => field.type === "text"), fields };
}

/** Compila solo i campi del piano. Firma, checkbox e campi non previsti restano vuoti. */
export async function fillOfficialPdf(
  bytes: Uint8Array,
  plan: OfficialFillPlan,
  options: { watermarked?: boolean } = {},
): Promise<Uint8Array> {
  const { PDFDocument, PDFTextField, StandardFonts, degrees, rgb } = await import("pdf-lib");
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const form = doc.getForm();
  const allowed = new Map(plan.fills.map((fill) => [fill.fieldName, fill.value]));

  for (const field of form.getFields()) {
    const value = allowed.get(field.getName());
    if (value === undefined) continue;
    if (!(field instanceof PDFTextField)) continue;
    try {
      field.setText(value);
    } catch {
      // Carattere non supportato dal font del campo: meglio vuoto che un valore inventato.
    }
  }

  if (options.watermarked) {
    const font = await doc.embedFont(StandardFonts.HelveticaBold);
    for (const page of doc.getPages()) {
      const { height } = page.getSize();
      page.drawText(TRIAL_WATERMARK, {
        x: 36,
        y: height / 2,
        size: 12,
        font,
        color: rgb(0.7, 0.7, 0.7),
        rotate: degrees(28),
        opacity: 0.45,
      });
    }
  }

  return doc.save();
}

export function triggerPdfDownload(bytes: Uint8Array, fileName: string): void {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const blob = new Blob([copy], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
