/**
 * pdfBuilder — Genera PDF de cotización con pdf-lib.
 *
 * Replica fielmente el diseño del QuoterClient Step 6 (Bluebox brand):
 * - Header con logos Jiménez + sello 40 años + slogan
 * - 3 columnas: comprador, inmueble, asesor
 * - Grid 2 columnas: render + plano (por tipología, si existen)
 * - Resumen financiero en caja dorada
 * - Tabla plan de pagos con colores alternados
 * - Legal + footer FocuxAI Engine™
 *
 * Imágenes se leen de /public/assets/ via filesystem (disponible en Vercel serverless).
 *
 * FocuxAI Engine™ — Deterministic. Auditable. Unstoppable.
 */

import { PDFDocument, StandardFonts, rgb, PDFPage, PDFFont, PDFImage } from 'pdf-lib';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import type { QuotationRow } from '../types';

// ── Hex → pdf-lib RGB ──
function hex(color: string) {
  return rgb(
    parseInt(color.slice(1, 3), 16) / 255,
    parseInt(color.slice(3, 5), 16) / 255,
    parseInt(color.slice(5, 7), 16) / 255,
  );
}

// ── Brand colors ──
const C = {
  gold: hex('#C2A360'),
  navy: hex('#2D4051'),
  midnight: hex('#182633'),
  sand: hex('#F4F0E5'),
  white: hex('#FFFFFF'),
  textSec: hex('#5A6872'),
  textTer: hex('#8C9AA4'),
  border: hex('#E0DCD2'),
  borderLight: hex('#EAE6DC'),
  goldBg: hex('#FAF8F2'),
  green: hex('#16A34A'),
  greenBg: hex('#F0FDF4'),
  red: hex('#DC2626'),
  altRow: hex('#F9F7F2'),
};

// ── Helpers ──
function fmt(n: number | string): string {
  const num = typeof n === 'string' ? parseFloat(n) : n;
  if (isNaN(num) || num === 0) return '$ 0';
  return `$ ${num.toLocaleString('es-CO', { maximumFractionDigits: 0 })}`;
}

function formatDate(val: string | Date): string {
  const d = val instanceof Date ? val : new Date(val);
  return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
}

function loadAsset(filename: string): Buffer | null {
  try {
    const p = path.join(process.cwd(), 'public', 'assets', filename);
    if (existsSync(p)) return readFileSync(p);
  } catch { /* ignore */ }
  return null;
}

function truncate(text: string, font: PDFFont, size: number, maxW: number): string {
  if (font.widthOfTextAtSize(text, size) <= maxW) return text;
  while (text.length > 0 && font.widthOfTextAtSize(text + '…', size) > maxW) {
    text = text.slice(0, -1);
  }
  return text + '…';
}

function drawTextRight(page: PDFPage, text: string, font: PDFFont, size: number, x: number, y: number, maxW: number, color: ReturnType<typeof rgb>) {
  const w = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: x + maxW - w, y, size, font, color });
}

// ── Wrap text helper ──
function wrapText(text: string, font: PDFFont, fontSize: number, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(test, fontSize) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

// ══════════════════════════════════════════════════════
// MAIN BUILDER
// ══════════════════════════════════════════════════════
export async function buildPdfBuffer(q: QuotationRow): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const PW = 612; // Letter width
  const PH = 792; // Letter height
  const M = 40;   // Margin
  const W = PW - M * 2; // Usable width

  let page = pdfDoc.addPage([PW, PH]);
  let y = PH - M;

  // Helper to add new page if needed
  function ensureSpace(needed: number) {
    if (y - needed < M + 30) {
      page = pdfDoc.addPage([PW, PH]);
      y = PH - M;
    }
  }

  // ═══════════════════════════════════════════════════
  // HEADER — logos + empresa + cotización
  // ═══════════════════════════════════════════════════

  // Try to embed logos
  let logoImg: PDFImage | null = null;
  let selloImg: PDFImage | null = null;

  const logoData = loadAsset('logo-jimenez-horizontal.png');
  if (logoData) {
    try { logoImg = await pdfDoc.embedPng(logoData); } catch { /* skip */ }
  }
  const selloData = loadAsset('sello-40-anos.png');
  if (selloData) {
    try { selloImg = await pdfDoc.embedPng(selloData); } catch { /* skip */ }
  }

  // Left side: logos + text
  let headerX = M;
  if (logoImg) {
    const logoH = 36;
    const logoW = (logoImg.width / logoImg.height) * logoH;
    page.drawImage(logoImg, { x: headerX, y: y - logoH + 4, width: logoW, height: logoH });
    headerX += logoW + 10;
  }
  if (selloImg) {
    const sH = 30;
    const sW = (selloImg.width / selloImg.height) * sH;
    page.drawImage(selloImg, { x: headerX, y: y - sH + 2, width: sW, height: sH });
    headerX += sW + 12;
  }

  page.drawText('CONSTRUCTORA JIMÉNEZ S.A.', { x: headerX, y: y - 4, size: 13, font: bold, color: C.navy });
  page.drawText('NIT: 802.021.085-1 · Santa Marta, Colombia', { x: headerX, y: y - 17, size: 9, font: helvetica, color: C.textSec });
  page.drawText('LO HACEMOS REALIDAD', { x: headerX, y: y - 28, size: 8, font: bold, color: C.gold });

  // Right side: cotización info
  const cotStr = String(q.cot_number);
  const rightX = M;
  const rightW = W;

  drawTextRight(page, 'COTIZACIÓN', bold, 8, rightX, y - 2, rightW, C.gold);
  drawTextRight(page, cotStr, helvetica, 18, rightX, y - 20, rightW, C.navy);
  drawTextRight(page, formatDate(q.created_at), helvetica, 9, rightX, y - 34, rightW, C.textSec);
  const vigencia = ((q.config_snapshot as Record<string, number>)?.vigenciaDias) ?? 7;
  drawTextRight(page, `Vigencia: ${vigencia} días`, helvetica, 8, rightX, y - 46, rightW, C.textTer);

  // Gold line
  y -= 52;
  page.drawLine({ start: { x: M, y }, end: { x: M + W, y }, thickness: 2, color: C.gold });

  // ═══════════════════════════════════════════════════
  // 3 COLUMNS — comprador, inmueble, asesor
  // ═══════════════════════════════════════════════════
  y -= 20;
  const colW = (W - 24) / 3;

  // Col 1 — Comprador
  const c1x = M;
  let cy = y;
  page.drawText('COMPRADOR', { x: c1x, y: cy, size: 7, font: bold, color: C.gold });
  cy -= 14;
  page.drawText(truncate(`${q.buyer_name} ${q.buyer_lastname}`, bold, 12, colW), { x: c1x, y: cy, size: 12, font: bold, color: C.navy });
  cy -= 14;
  page.drawText(`${q.buyer_doc_type} ${q.buyer_doc_number}`, { x: c1x, y: cy, size: 10, font: helvetica, color: C.textSec });
  cy -= 12;
  page.drawText(truncate(String(q.buyer_email), helvetica, 10, colW), { x: c1x, y: cy, size: 10, font: helvetica, color: C.textSec });
  cy -= 12;
  page.drawText(`${q.buyer_phone_cc} ${q.buyer_phone}`, { x: c1x, y: cy, size: 10, font: helvetica, color: C.textSec });

  // Col 2 — Inmueble
  const c2x = M + colW + 12;
  cy = y;
  page.drawText('INMUEBLE', { x: c2x, y: cy, size: 7, font: bold, color: C.gold });
  cy -= 14;
  page.drawText(truncate(`${q.macro_name} — ${q.torre_name}`, bold, 12, colW), { x: c2x, y: cy, size: 12, font: bold, color: C.navy });
  cy -= 14;
  let unitLine = `Apto ${q.unit_number}`;
  if (q.unit_tipologia) unitLine += ` · Tipo ${q.unit_tipologia}`;
  if (q.unit_piso != null) unitLine += ` · Piso ${q.unit_piso}`;
  page.drawText(truncate(unitLine, helvetica, 10, colW), { x: c2x, y: cy, size: 10, font: helvetica, color: C.textSec });
  cy -= 12;
  let areaLine = `${q.unit_area} m²`;
  if (q.unit_habs != null) areaLine += ` · ${q.unit_habs} hab`;
  if (q.unit_banos != null) areaLine += ` · ${q.unit_banos} baños`;
  page.drawText(truncate(areaLine, helvetica, 10, colW), { x: c2x, y: cy, size: 10, font: helvetica, color: C.textSec });

  // Parking/Storage
  const parkingArr = (q.parking as Array<{ numero: string }>) || [];
  const storageArr = (q.storage as Array<{ numero: string }>) || [];
  if (parkingArr.length > 0) {
    cy -= 12;
    page.drawText(`Parq: ${parkingArr.map(p => p.numero).join(', ')}`, { x: c2x, y: cy, size: 10, font: helvetica, color: C.textSec });
  } else if (q.includes_parking) {
    cy -= 12;
    page.drawText('Parqueadero incluido *', { x: c2x, y: cy, size: 10, font: helvetica, color: C.textSec });
  }
  if (storageArr.length > 0) {
    cy -= 12;
    page.drawText(`Dep: ${storageArr.map(d => d.numero).join(', ')}`, { x: c2x, y: cy, size: 10, font: helvetica, color: C.textSec });
  } else if (q.includes_storage) {
    cy -= 12;
    page.drawText('Depósito incluido *', { x: c2x, y: cy, size: 10, font: helvetica, color: C.textSec });
  }

  // Col 3 — Asesor
  const c3x = M + (colW + 12) * 2;
  cy = y;
  page.drawText('ASESOR', { x: c3x, y: cy, size: 7, font: bold, color: C.gold });
  cy -= 14;
  page.drawText(truncate(String(q.advisor_name), bold, 12, colW), { x: c3x, y: cy, size: 12, font: bold, color: C.navy });
  cy -= 14;
  const saleLabel = Number(q.sale_type) === 0 ? 'Contado' : Number(q.sale_type) === 1 ? 'Crédito' : 'Leasing';
  page.drawText(`Tipo venta: ${saleLabel}`, { x: c3x, y: cy, size: 10, font: helvetica, color: C.textSec });

  // ═══════════════════════════════════════════════════
  // RENDER + PLANO (if exist)
  // ═══════════════════════════════════════════════════
  y -= 82;

  const tipologia = q.unit_tipologia || '';
  const renderData = tipologia ? loadAsset(`render-${tipologia}.png`) : null;
  const planoData = tipologia ? loadAsset(`plano-${tipologia}.png`) : null;

  if (renderData || planoData) {
    ensureSpace(170);
    const imgW = (W - 12) / 2;
    const imgH = 140;
    const labelH = 16;

    const images: Array<{ label: string; data: Buffer | null }> = [
      { label: `RENDER — Tipo ${tipologia}`, data: renderData },
      { label: `PLANO — Tipo ${tipologia}`, data: planoData },
    ];

    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      if (!img.data) continue;
      const ix = M + i * (imgW + 12);

      // Label bar (gold bg)
      page.drawRectangle({
        x: ix, y: y - labelH, width: imgW, height: labelH,
        color: C.goldBg, borderColor: C.borderLight, borderWidth: 0.5,
      });
      page.drawText(img.label, { x: ix + 8, y: y - 12, size: 7, font: bold, color: C.textSec });

      // Image area
      page.drawRectangle({
        x: ix, y: y - labelH - imgH, width: imgW, height: imgH,
        color: C.altRow, borderColor: C.borderLight, borderWidth: 0.5,
      });

      try {
        const pdfImg = await pdfDoc.embedPng(img.data);
        // Scale to fit within imgW x imgH maintaining aspect ratio
        const scale = Math.min(imgW / pdfImg.width, imgH / pdfImg.height) * 0.9;
        const drawW = pdfImg.width * scale;
        const drawH = pdfImg.height * scale;
        const cx = ix + (imgW - drawW) / 2;
        const cy2 = (y - labelH - imgH) + (imgH - drawH) / 2;
        page.drawImage(pdfImg, { x: cx, y: cy2, width: drawW, height: drawH });
      } catch {
        // If PNG embedding fails, just show the label
        page.drawText('Imagen no disponible', {
          x: ix + imgW / 2 - 35, y: y - labelH - imgH / 2, size: 9, font: helvetica, color: C.textTer,
        });
      }
    }

    y -= labelH + imgH + 14;
  }

  // ═══════════════════════════════════════════════════
  // FINANCIAL SUMMARY BOX
  // ═══════════════════════════════════════════════════
  ensureSpace(60);
  const boxH = 52;

  // Gold background box with border
  page.drawRectangle({
    x: M, y: y - boxH, width: W, height: boxH,
    color: C.goldBg, borderColor: C.borderLight, borderWidth: 0.5,
  });

  const totalDisc = Number(q.total_discounts) || 0;
  const finItems: Array<{ label: string; value: string; color: ReturnType<typeof rgb> }> = [];

  if (totalDisc > 0) {
    finItems.push({ label: 'SUBTOTAL', value: fmt(q.subtotal), color: C.navy });
    finItems.push({ label: 'DESCUENTOS', value: `-${fmt(totalDisc)}`, color: C.red });
    finItems.push({ label: 'VALOR NETO', value: fmt(q.net_value), color: C.gold });
  } else {
    finItems.push({ label: 'VALOR TOTAL', value: fmt(q.net_value), color: C.gold });
  }
  finItems.push({ label: 'SEPARACIÓN', value: fmt(q.separation_amount), color: C.navy });
  finItems.push({ label: `CI (${Number(q.initial_payment_pct)}%)`, value: fmt(q.initial_payment_amount), color: C.navy });
  finItems.push({ label: `${q.num_installments} CUOTAS DE`, value: fmt(q.installment_amount), color: C.navy });
  finItems.push({ label: `FINANC. (${Number(q.financed_pct)}%)`, value: fmt(q.financed_amount), color: C.navy });

  const itemW = W / finItems.length;
  finItems.forEach((item, i) => {
    const ix = M + i * itemW;
    // Label centered
    const labelW = helvetica.widthOfTextAtSize(item.label, 6);
    page.drawText(item.label, { x: ix + (itemW - labelW) / 2, y: y - 16, size: 6, font: bold, color: C.textSec });
    // Value centered
    const valW = bold.widthOfTextAtSize(item.value, 11);
    page.drawText(item.value, { x: ix + (itemW - valW) / 2, y: y - 34, size: 11, font: bold, color: item.color });
  });

  y -= boxH + 16;

  // ═══════════════════════════════════════════════════
  // PAYMENT TABLE
  // ═══════════════════════════════════════════════════
  const paymentPlan = (q.payment_plan as Array<{ concepto: string; mes: string; pago: number; tipo: string }>) || [];

  ensureSpace(40);
  // Title
  page.drawText('PLAN DE PAGOS', { x: M, y, size: 8, font: bold, color: C.gold });
  const countStr = `${paymentPlan.length} conceptos`;
  drawTextRight(page, countStr, helvetica, 8, M, y, W, C.textTer);
  y -= 14;

  // Table header
  const rowH = 16;
  page.drawRectangle({ x: M, y: y - rowH, width: W, height: rowH, color: C.goldBg });
  page.drawLine({ start: { x: M, y: y - rowH }, end: { x: M + W, y: y - rowH }, thickness: 1.5, color: C.borderLight });

  const tCols = { num: 28, concepto: W - 228, mes: 120, valor: 80 };
  page.drawText('#', { x: M + 6, y: y - 11, size: 7, font: bold, color: C.textSec });
  page.drawText('CONCEPTO', { x: M + tCols.num + 6, y: y - 11, size: 7, font: bold, color: C.textSec });
  page.drawText('MES', { x: M + tCols.num + tCols.concepto + 6, y: y - 11, size: 7, font: bold, color: C.textSec });
  drawTextRight(page, 'VALOR', bold, 7, M + W - tCols.valor, y - 11, tCols.valor - 6, C.textSec);
  y -= rowH;

  // Table rows
  for (let i = 0; i < paymentPlan.length; i++) {
    ensureSpace(rowH + 2);
    const r = paymentPlan[i];
    const isSep = r.concepto === 'Separación';
    const isSaldo = r.concepto?.includes('Saldo');
    const isTotal = r.tipo === 'total';
    const isAbono = r.tipo === 'abono';
    const isHighlight = isSep || isSaldo || isTotal;

    // Row background
    if (isHighlight) {
      page.drawRectangle({ x: M, y: y - rowH, width: W, height: rowH, color: C.goldBg });
    } else if (isAbono) {
      page.drawRectangle({ x: M, y: y - rowH, width: W, height: rowH, color: C.greenBg });
    } else if (i % 2 === 0) {
      page.drawRectangle({ x: M, y: y - rowH, width: W, height: rowH, color: C.white });
    } else {
      page.drawRectangle({ x: M, y: y - rowH, width: W, height: rowH, color: C.altRow });
    }

    // Bottom border
    page.drawLine({ start: { x: M, y: y - rowH }, end: { x: M + W, y: y - rowH }, thickness: 0.5, color: C.borderLight });

    // Cell: #
    page.drawText(String(i + 1), { x: M + 6, y: y - 11, size: 9, font: helvetica, color: C.textTer });
    // Cell: Concepto
    const concColor = isSep ? C.gold : isAbono ? C.green : isHighlight ? C.navy : C.midnight;
    page.drawText(truncate(r.concepto || '', isHighlight ? bold : helvetica, 10, tCols.concepto - 8), {
      x: M + tCols.num + 6, y: y - 11, size: 10, font: isHighlight ? bold : helvetica, color: concColor,
    });
    // Cell: Mes
    page.drawText(r.mes || '', { x: M + tCols.num + tCols.concepto + 6, y: y - 11, size: 9, font: helvetica, color: C.textSec });
    // Cell: Valor
    const valColor = isSep ? C.gold : isAbono ? C.green : C.navy;
    const valStr = fmt(r.pago);
    drawTextRight(page, valStr, isHighlight ? bold : helvetica, 10, M + W - tCols.valor, y - 11, tCols.valor - 6, valColor);

    y -= rowH;
  }

  // ═══════════════════════════════════════════════════
  // LEGAL
  // ═══════════════════════════════════════════════════
  ensureSpace(60);
  y -= 10;
  page.drawLine({ start: { x: M, y }, end: { x: M + W, y }, thickness: 0.5, color: C.border });
  y -= 12;

  const legalText = '* El cliente cancela el 100% de los Gastos de Registro e Impuestos de Registro y asume el 50% de los Derechos Notariales. Los precios y condiciones de venta pueden ser modificados sin previo aviso. Esta cotización no constituye reserva ni compromiso de venta.';
  const legalLines = wrapText(legalText, helvetica, 8, W);
  for (const line of legalLines) {
    page.drawText(line, { x: M, y, size: 8, font: helvetica, color: C.textTer });
    y -= 10;
  }
  y -= 4;
  page.drawText(`Vigencia de esta cotización: ${vigencia} días calendario a partir de la fecha de emisión.`, {
    x: M, y, size: 8, font: bold, color: C.textSec,
  });

  // ═══════════════════════════════════════════════════
  // FOOTER
  // ═══════════════════════════════════════════════════
  y -= 18;
  page.drawLine({ start: { x: M, y }, end: { x: M + W, y }, thickness: 0.5, color: C.border });
  y -= 10;

  const genStr = `Generado por FocuxAI Engine™ · ${new Date().toLocaleString('es-CO')}`;
  page.drawText(genStr, { x: M, y, size: 7, font: helvetica, color: C.textTer });
  drawTextRight(page, String(q.cot_number), helvetica, 7, M, y, W, C.textTer);

  y -= 14;
  const brandStr = 'POWERED BY FOCUXAI ENGINE™ · FOCUX DIGITAL GROUP S.A.S.';
  const brandW = bold.widthOfTextAtSize(brandStr, 7);
  page.drawText(brandStr, { x: M + (W - brandW) / 2, y, size: 7, font: bold, color: C.gold });

  return await pdfDoc.save();
}
