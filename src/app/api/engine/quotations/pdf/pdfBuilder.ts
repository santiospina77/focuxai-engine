/**
 * pdfBuilder — Genera PDF de cotización con pdf-lib (zero native deps, serverless-safe).
 *
 * Diseño Bluebox: header dorado, 3 columnas, resumen financiero, tabla pagos, legal, footer.
 *
 * FocuxAI Engine™ — Deterministic. Auditable. Unstoppable.
 */

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { QuotationRow } from '../types';

// ── Hex to RGB ──
function hex(color: string) {
  const r = parseInt(color.slice(1, 3), 16) / 255;
  const g = parseInt(color.slice(3, 5), 16) / 255;
  const b = parseInt(color.slice(5, 7), 16) / 255;
  return rgb(r, g, b);
}

const C = {
  gold: hex('#C2A360'),
  navy: hex('#2D4051'),
  midnight: hex('#182633'),
  sand: hex('#F4F0E5'),
  white: hex('#FFFFFF'),
  textSec: hex('#5A6872'),
  textTer: hex('#8C9AA4'),
  border: hex('#E0DCD2'),
  sandRaw: '#F4F0E5',
};

// ── Helpers ──
function fmt(n: number | string): string {
  const num = typeof n === 'string' ? parseFloat(n) : n;
  if (isNaN(num)) return '$ 0';
  return `$ ${num.toLocaleString('es-CO', { maximumFractionDigits: 0 })}`;
}

function formatDate(val: string | Date): string {
  const d = val instanceof Date ? val : new Date(val);
  return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
}

// ── Main builder ──
export async function buildPdfBuffer(q: QuotationRow): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]); // LETTER

  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const W = 612 - 80; // usable width
  const L = 40; // left margin
  const pageTop = 752; // top margin = 40

  let y = pageTop;

  // ═══════════════════════════════════════════════════
  // HEADER
  // ═══════════════════════════════════════════════════
  page.drawText('CONSTRUCTORA JIMÉNEZ S.A.', {
    x: L, y, size: 14, font: helveticaBold, color: C.navy,
  });
  y -= 14;
  page.drawText('NIT: 802.021.085-1 · Santa Marta, Colombia', {
    x: L, y, size: 9, font: helvetica, color: C.textSec,
  });
  y -= 11;
  page.drawText('LO HACEMOS REALIDAD', {
    x: L, y, size: 8, font: helvetica, color: C.gold,
  });

  // Right side
  const cotStr = String(q.cot_number);
  const cotW = helvetica.widthOfTextAtSize(cotStr, 14);
  page.drawText('COTIZACIÓN', {
    x: 612 - 40 - helvetica.widthOfTextAtSize('COTIZACIÓN', 8), y: pageTop, size: 8, font: helvetica, color: C.gold,
  });
  page.drawText(cotStr, {
    x: 612 - 40 - cotW, y: pageTop - 14, size: 14, font: helvetica, color: C.navy,
  });
  const dateStr = formatDate(q.created_at);
  page.drawText(dateStr, {
    x: 612 - 40 - helvetica.widthOfTextAtSize(dateStr, 9), y: pageTop - 28, size: 9, font: helvetica, color: C.textSec,
  });
  const vigencia = ((q.config_snapshot as Record<string, number>)?.vigenciaDias) ?? 7;
  const vigStr = `Vigencia: ${vigencia} días`;
  page.drawText(vigStr, {
    x: 612 - 40 - helvetica.widthOfTextAtSize(vigStr, 8), y: pageTop - 40, size: 8, font: helvetica, color: C.textTer,
  });

  // Gold line
  y -= 8;
  page.drawLine({ start: { x: L, y }, end: { x: L + W, y }, thickness: 2, color: C.gold });

  // ═══════════════════════════════════════════════════
  // 3 COLUMNS
  // ═══════════════════════════════════════════════════
  y -= 18;
  const colW = W / 3;

  // Col 1 — Comprador
  let cy = y;
  page.drawText('COMPRADOR', { x: L, y: cy, size: 7, font: helveticaBold, color: C.gold });
  cy -= 14;
  page.drawText(`${q.buyer_name} ${q.buyer_lastname}`, { x: L, y: cy, size: 11, font: helveticaBold, color: C.navy });
  cy -= 13;
  page.drawText(`${q.buyer_doc_type} ${q.buyer_doc_number}`, { x: L, y: cy, size: 9, font: helvetica, color: C.textSec });
  cy -= 11;
  page.drawText(String(q.buyer_email), { x: L, y: cy, size: 9, font: helvetica, color: C.textSec });
  cy -= 11;
  page.drawText(`${q.buyer_phone_cc} ${q.buyer_phone}`, { x: L, y: cy, size: 9, font: helvetica, color: C.textSec });

  // Col 2 — Inmueble
  const col2x = L + colW + 8;
  cy = y;
  page.drawText('INMUEBLE', { x: col2x, y: cy, size: 7, font: helveticaBold, color: C.gold });
  cy -= 14;
  page.drawText(`${q.macro_name} — ${q.torre_name}`, { x: col2x, y: cy, size: 11, font: helveticaBold, color: C.navy });
  cy -= 13;
  let unitLine = `Apto ${q.unit_number}`;
  if (q.unit_tipologia) unitLine += ` · Tipo ${q.unit_tipologia}`;
  if (q.unit_piso != null) unitLine += ` · Piso ${q.unit_piso}`;
  page.drawText(unitLine, { x: col2x, y: cy, size: 9, font: helvetica, color: C.textSec });
  cy -= 11;
  let areaLine = `${q.unit_area} m²`;
  if (q.unit_habs != null) areaLine += ` · ${q.unit_habs} hab`;
  if (q.unit_banos != null) areaLine += ` · ${q.unit_banos} baños`;
  page.drawText(areaLine, { x: col2x, y: cy, size: 9, font: helvetica, color: C.textSec });

  // Col 3 — Asesor
  const col3x = L + colW * 2 + 16;
  cy = y;
  page.drawText('ASESOR', { x: col3x, y: cy, size: 7, font: helveticaBold, color: C.gold });
  cy -= 14;
  page.drawText(String(q.advisor_name), { x: col3x, y: cy, size: 11, font: helveticaBold, color: C.navy });
  cy -= 13;
  const saleLabel = Number(q.sale_type) === 0 ? 'Contado' : Number(q.sale_type) === 1 ? 'Crédito' : 'Leasing';
  page.drawText(`Tipo venta: ${saleLabel}`, { x: col3x, y: cy, size: 9, font: helvetica, color: C.textSec });

  // ═══════════════════════════════════════════════════
  // FINANCIAL SUMMARY BOX
  // ═══════════════════════════════════════════════════
  y -= 90;
  const boxH = 48;

  // Sand background
  page.drawRectangle({ x: L, y: y - boxH, width: W, height: boxH, color: C.sand, borderColor: C.border, borderWidth: 0.5 });

  const totalDisc = Number(q.total_discounts) || 0;
  const finItems: Array<{ label: string; value: string; highlight?: boolean }> = [];

  if (totalDisc > 0) {
    finItems.push({ label: 'SUBTOTAL', value: fmt(q.subtotal) });
    finItems.push({ label: 'DESCUENTOS', value: `-${fmt(totalDisc)}` });
    finItems.push({ label: 'VALOR NETO', value: fmt(q.net_value), highlight: true });
  } else {
    finItems.push({ label: 'VALOR TOTAL', value: fmt(q.net_value), highlight: true });
  }
  finItems.push({ label: 'SEPARACIÓN', value: fmt(q.separation_amount) });
  finItems.push({ label: `CI (${Number(q.initial_payment_pct)}%)`, value: fmt(q.initial_payment_amount) });
  finItems.push({ label: `${q.num_installments} CUOTAS DE`, value: fmt(q.installment_amount) });
  finItems.push({ label: `FINANC. (${Number(q.financed_pct)}%)`, value: fmt(q.financed_amount) });

  const itemW = W / finItems.length;
  finItems.forEach((item, i) => {
    const ix = L + i * itemW;
    const labelW = helvetica.widthOfTextAtSize(item.label, 6);
    page.drawText(item.label, {
      x: ix + (itemW - labelW) / 2, y: y - 14, size: 6, font: helvetica, color: C.textSec,
    });
    const valW = helveticaBold.widthOfTextAtSize(item.value, 10);
    page.drawText(item.value, {
      x: ix + (itemW - valW) / 2, y: y - 30, size: 10, font: helveticaBold, color: item.highlight ? C.gold : C.navy,
    });
  });

  // ═══════════════════════════════════════════════════
  // PAYMENT TABLE
  // ═══════════════════════════════════════════════════
  y -= boxH + 20;
  const paymentPlan = (q.payment_plan as Array<{ concepto: string; mes: string; pago: number; tipo: string }>) || [];

  page.drawText(`PLAN DE PAGOS — ${paymentPlan.length} conceptos`, {
    x: L, y, size: 8, font: helveticaBold, color: C.textSec,
  });
  y -= 16;

  // Table header
  const rowH = 14;
  page.drawRectangle({ x: L, y: y - rowH, width: W, height: rowH, color: C.sand });
  page.drawText('#', { x: L + 4, y: y - 10, size: 7, font: helveticaBold, color: C.textSec });
  page.drawText('CONCEPTO', { x: L + 30, y: y - 10, size: 7, font: helveticaBold, color: C.textSec });
  page.drawText('MES', { x: L + 280, y: y - 10, size: 7, font: helveticaBold, color: C.textSec });
  const valorLabel = 'VALOR';
  page.drawText(valorLabel, {
    x: L + W - 4 - helveticaBold.widthOfTextAtSize(valorLabel, 7), y: y - 10, size: 7, font: helveticaBold, color: C.textSec,
  });
  y -= rowH;

  // Table rows
  paymentPlan.forEach((r, i) => {
    const isSep = r.concepto === 'Separación';
    const isSaldo = r.concepto?.includes('Saldo');
    const isTotal = r.tipo === 'total';
    const isHighlight = isSep || isSaldo || isTotal;

    if (isHighlight) {
      page.drawRectangle({ x: L, y: y - rowH, width: W, height: rowH, color: C.sand });
    } else if (i % 2 === 1) {
      page.drawRectangle({ x: L, y: y - rowH, width: W, height: rowH, color: hex('#F9F7F2') });
    }

    page.drawText(String(i + 1), { x: L + 4, y: y - 10, size: 8, font: helvetica, color: C.textTer });
    page.drawText(r.concepto || '', { x: L + 30, y: y - 10, size: 9, font: isHighlight ? helveticaBold : helvetica, color: isHighlight ? C.navy : C.midnight });
    page.drawText(r.mes || '', { x: L + 280, y: y - 10, size: 8, font: helvetica, color: C.textSec });
    const valStr = fmt(r.pago);
    page.drawText(valStr, {
      x: L + W - 4 - (isHighlight ? helveticaBold : helvetica).widthOfTextAtSize(valStr, 9),
      y: y - 10, size: 9, font: isHighlight ? helveticaBold : helvetica, color: C.navy,
    });

    // Bottom border
    page.drawLine({ start: { x: L, y: y - rowH }, end: { x: L + W, y: y - rowH }, thickness: 0.5, color: C.border });
    y -= rowH;
  });

  // ═══════════════════════════════════════════════════
  // LEGAL
  // ═══════════════════════════════════════════════════
  y -= 14;
  page.drawLine({ start: { x: L, y }, end: { x: L + W, y }, thickness: 0.5, color: C.border });
  y -= 12;

  const legalText = '* El cliente cancela el 100% de los Gastos de Registro e Impuestos de Registro y asume el 50% de los Derechos Notariales. Los precios y condiciones de venta pueden ser modificados sin previo aviso.';
  // pdf-lib doesn't auto-wrap, so we'll keep it on one block
  const legalLines = wrapText(legalText, helvetica, 8, W);
  legalLines.forEach(line => {
    page.drawText(line, { x: L, y, size: 8, font: helvetica, color: C.textTer });
    y -= 10;
  });

  y -= 4;
  page.drawText(`Vigencia de esta cotización: ${vigencia} días calendario a partir de la fecha de emisión.`, {
    x: L, y, size: 8, font: helveticaBold, color: C.textSec,
  });

  // ═══════════════════════════════════════════════════
  // FOOTER
  // ═══════════════════════════════════════════════════
  y -= 20;
  page.drawLine({ start: { x: L, y }, end: { x: L + W, y }, thickness: 0.5, color: C.border });
  y -= 10;

  const genStr = `Generado por FocuxAI Engine™ · ${new Date().toLocaleString('es-CO')}`;
  page.drawText(genStr, { x: L, y, size: 7, font: helvetica, color: C.textTer });
  page.drawText(String(q.cot_number), {
    x: L + W - helvetica.widthOfTextAtSize(String(q.cot_number), 7), y, size: 7, font: helvetica, color: C.textTer,
  });

  y -= 14;
  const brandStr = 'POWERED BY FOCUXAI ENGINE™ · FOCUX DIGITAL GROUP S.A.S.';
  const brandW = helveticaBold.widthOfTextAtSize(brandStr, 7);
  page.drawText(brandStr, {
    x: L + (W - brandW) / 2, y, size: 7, font: helveticaBold, color: C.gold,
  });

  const pdfBytes = await pdfDoc.save();
  return pdfBytes;
}

// ── Text wrapping helper (pdf-lib doesn't auto-wrap) ──
function wrapText(text: string, font: { widthOfTextAtSize: (s: string, size: number) => number }, fontSize: number, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const testWidth = font.widthOfTextAtSize(testLine, fontSize);
    if (testWidth > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}
