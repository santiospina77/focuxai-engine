/**
 * pdfBuilder — PDF de cotización con pdf-lib + imágenes via fetch.
 *
 * Logos e imágenes se cargan desde la URL pública del engine.
 * Layout replica el QuoterClient Step 6 lo más fielmente posible
 * dentro de las limitaciones de pdf-lib (coordenadas absolutas, fonts estándar).
 *
 * FocuxAI Engine™ — Deterministic. Auditable. Unstoppable.
 */

import { PDFDocument, StandardFonts, rgb, PDFPage, PDFFont, PDFImage } from 'pdf-lib';
import type { QuotationRow } from '../types';

// ── Hex → rgb ──
function hex(c: string) {
  return rgb(parseInt(c.slice(1, 3), 16) / 255, parseInt(c.slice(3, 5), 16) / 255, parseInt(c.slice(5, 7), 16) / 255);
}

const C = {
  gold: hex('#C2A360'), navy: hex('#2D4051'), midnight: hex('#182633'),
  sand: hex('#F4F0E5'), goldBg: hex('#FAF8F2'), white: hex('#FFFFFF'),
  textSec: hex('#5A6872'), textTer: hex('#8C9AA4'),
  border: hex('#E0DCD2'), borderLight: hex('#EAE6DC'),
  green: hex('#16A34A'), greenBg: hex('#F0FDF4'),
  red: hex('#DC2626'), altRow: hex('#F9F7F2'), imgBg: hex('#F5F3EE'),
};

function fmt(n: number | string): string {
  const num = typeof n === 'string' ? parseFloat(n) : n;
  if (isNaN(num) || num === 0) return '$ 0';
  return `$ ${num.toLocaleString('es-CO', { maximumFractionDigits: 0 })}`;
}

function fmtDate(val: string | Date): string {
  const d = val instanceof Date ? val : new Date(val);
  return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
}

function truncate(text: string, font: PDFFont, size: number, maxW: number): string {
  if (!text) return '';
  if (font.widthOfTextAtSize(text, size) <= maxW) return text;
  while (text.length > 0 && font.widthOfTextAtSize(text + '...', size) > maxW) text = text.slice(0, -1);
  return text + '...';
}

function drawRight(page: PDFPage, text: string, font: PDFFont, size: number, rightEdge: number, y: number, color: ReturnType<typeof rgb>) {
  page.drawText(text, { x: rightEdge - font.widthOfTextAtSize(text, size), y, size, font, color });
}

function wrapText(text: string, font: PDFFont, fontSize: number, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (font.widthOfTextAtSize(test, fontSize) > maxWidth && cur) { lines.push(cur); cur = w; }
    else cur = test;
  }
  if (cur) lines.push(cur);
  return lines;
}

// ── Fetch image from public URL ──
async function fetchImage(baseUrl: string, filename: string): Promise<Uint8Array | null> {
  try {
    const res = await fetch(`${baseUrl}/assets/${filename}`);
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch { return null; }
}

async function embedImage(pdfDoc: PDFDocument, data: Uint8Array | null): Promise<PDFImage | null> {
  if (!data) return null;
  try { return await pdfDoc.embedPng(data); }
  catch {
    try { return await pdfDoc.embedJpg(data); }
    catch { return null; }
  }
}

// ══════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════
export async function buildPdfBuffer(q: QuotationRow): Promise<Uint8Array> {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://engine.focux.co');

  const pdfDoc = await PDFDocument.create();
  const hv = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bd = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const PW = 612, PH = 792, M = 36;
  const W = PW - M * 2;
  const RE = M + W; // right edge

  let page = pdfDoc.addPage([PW, PH]);
  let y = PH - M;

  function newPageIfNeeded(need: number) {
    if (y - need < M + 20) { page = pdfDoc.addPage([PW, PH]); y = PH - M; }
  }

  // ── Fetch all images in parallel ──
  const tipologia = q.unit_tipologia || '';
  const [logoData, selloData, renderData, planoData] = await Promise.all([
    fetchImage(baseUrl, 'logo-jimenez-horizontal.png'),
    fetchImage(baseUrl, 'sello-40-anos.png'),
    tipologia ? fetchImage(baseUrl, `render-${tipologia}.png`) : null,
    tipologia ? fetchImage(baseUrl, `plano-${tipologia}.png`) : null,
  ]);

  const [logoImg, selloImg, renderImg, planoImg] = await Promise.all([
    embedImage(pdfDoc, logoData),
    embedImage(pdfDoc, selloData),
    embedImage(pdfDoc, renderData),
    embedImage(pdfDoc, planoData),
  ]);

  // ═══════════════════════════════════════════════════
  // HEADER
  // ═══════════════════════════════════════════════════
  let hx = M;
  const headerTop = y;

  if (logoImg) {
    const lh = 38, lw = (logoImg.width / logoImg.height) * lh;
    page.drawImage(logoImg, { x: hx, y: y - lh + 6, width: lw, height: lh });
    hx += lw + 10;
  }
  if (selloImg) {
    const sh = 32, sw = (selloImg.width / selloImg.height) * sh;
    page.drawImage(selloImg, { x: hx, y: y - sh + 4, width: sw, height: sh });
    hx += sw + 12;
  }

  page.drawText('CONSTRUCTORA JIMÉNEZ S.A.', { x: hx, y: y - 2, size: 14, font: bd, color: C.navy });
  page.drawText('NIT: 802.021.085-1 · Santa Marta, Colombia', { x: hx, y: y - 16, size: 9, font: hv, color: C.textSec });
  page.drawText('LO HACEMOS REALIDAD', { x: hx, y: y - 28, size: 8, font: bd, color: C.gold });

  // Right side
  drawRight(page, 'COTIZACIÓN', bd, 8, RE, headerTop - 2, C.gold);
  drawRight(page, String(q.cot_number), hv, 20, RE, headerTop - 22, C.navy);
  drawRight(page, fmtDate(q.created_at), hv, 9, RE, headerTop - 36, C.textSec);
  const vigencia = ((q.config_snapshot as Record<string, number>)?.vigenciaDias) ?? 7;
  drawRight(page, `Vigencia: ${vigencia} días`, hv, 8, RE, headerTop - 48, C.textTer);

  // Gold line
  y -= 54;
  page.drawLine({ start: { x: M, y }, end: { x: RE, y }, thickness: 2, color: C.gold });

  // ═══════════════════════════════════════════════════
  // 3 COLUMNS
  // ═══════════════════════════════════════════════════
  y -= 22;
  const colW = (W - 24) / 3;
  const c2x = M + colW + 12, c3x = M + (colW + 12) * 2;

  function drawCol(x: number, label: string, name: string, details: string[]) {
    let cy = y;
    page.drawText(label, { x, y: cy, size: 7, font: bd, color: C.gold });
    cy -= 15;
    page.drawText(truncate(name, bd, 13, colW), { x, y: cy, size: 13, font: bd, color: C.navy });
    cy -= 15;
    for (const d of details) {
      if (!d) continue;
      page.drawText(truncate(d, hv, 10, colW), { x, y: cy, size: 10, font: hv, color: C.textSec });
      cy -= 12;
    }
  }

  // Comprador
  drawCol(M, 'COMPRADOR', `${q.buyer_name} ${q.buyer_lastname}`, [
    `${q.buyer_doc_type} ${q.buyer_doc_number}`,
    String(q.buyer_email),
    `${q.buyer_phone_cc} ${q.buyer_phone}`,
  ]);

  // Inmueble
  const parkingArr = (q.parking as Array<{ numero: string }>) || [];
  const storageArr = (q.storage as Array<{ numero: string }>) || [];
  const unitDetails: string[] = [];
  let uLine = `Apto ${q.unit_number}`;
  if (q.unit_tipologia) uLine += ` · Tipo ${q.unit_tipologia}`;
  if (q.unit_piso != null) uLine += ` · Piso ${q.unit_piso}`;
  unitDetails.push(uLine);
  let aLine = `${q.unit_area} m²`;
  if (q.unit_habs != null) aLine += ` · ${q.unit_habs} hab`;
  if (q.unit_banos != null) aLine += ` · ${q.unit_banos} baños`;
  unitDetails.push(aLine);
  if (parkingArr.length > 0) unitDetails.push(`Parq: ${parkingArr.map(p => p.numero).join(', ')}`);
  else if (q.includes_parking) unitDetails.push('Parqueadero incluido *');
  if (storageArr.length > 0) unitDetails.push(`Dep: ${storageArr.map(d => d.numero).join(', ')}`);
  else if (q.includes_storage) unitDetails.push('Depósito incluido *');
  drawCol(c2x, 'INMUEBLE', `${q.macro_name} — ${q.torre_name}`, unitDetails);

  // Asesor
  const saleLabel = Number(q.sale_type) === 0 ? 'Contado' : Number(q.sale_type) === 1 ? 'Crédito' : 'Leasing';
  drawCol(c3x, 'ASESOR', String(q.advisor_name), [`Tipo venta: ${saleLabel}`]);

  y -= 78;

  // ═══════════════════════════════════════════════════
  // RENDER + PLANO
  // ═══════════════════════════════════════════════════
  if (renderImg || planoImg) {
    newPageIfNeeded(190);
    const imgBoxW = (W - 14) / 2;
    const labelH = 18;
    const imgAreaH = 150;

    const images: Array<{ label: string; img: PDFImage | null; idx: number }> = [
      { label: `RENDER — Tipo ${tipologia}`, img: renderImg, idx: 0 },
      { label: `PLANO — Tipo ${tipologia}`, img: planoImg, idx: 1 },
    ];

    for (const { label, img, idx } of images) {
      if (!img) continue;
      const ix = M + idx * (imgBoxW + 14);

      // Label bar
      page.drawRectangle({ x: ix, y: y - labelH, width: imgBoxW, height: labelH, color: C.goldBg, borderColor: C.borderLight, borderWidth: 0.5 });
      page.drawText(label, { x: ix + 10, y: y - 13, size: 7, font: bd, color: C.textSec });

      // Image area background
      page.drawRectangle({ x: ix, y: y - labelH - imgAreaH, width: imgBoxW, height: imgAreaH, color: C.imgBg, borderColor: C.borderLight, borderWidth: 0.5 });

      // Image scaled to fit
      const scale = Math.min((imgBoxW - 16) / img.width, (imgAreaH - 12) / img.height);
      const dw = img.width * scale, dh = img.height * scale;
      page.drawImage(img, {
        x: ix + (imgBoxW - dw) / 2,
        y: (y - labelH - imgAreaH) + (imgAreaH - dh) / 2,
        width: dw, height: dh,
      });
    }
    y -= labelH + imgAreaH + 16;
  }

  // ═══════════════════════════════════════════════════
  // FINANCIAL SUMMARY
  // ═══════════════════════════════════════════════════
  newPageIfNeeded(65);
  const boxH = 56;
  page.drawRectangle({ x: M, y: y - boxH, width: W, height: boxH, color: C.goldBg, borderColor: C.borderLight, borderWidth: 0.5 });

  const totalDisc = Number(q.total_discounts) || 0;
  const finItems: Array<{ l: string; v: string; c: ReturnType<typeof rgb> }> = [];
  if (totalDisc > 0) {
    finItems.push({ l: 'SUBTOTAL', v: fmt(q.subtotal), c: C.navy });
    finItems.push({ l: 'DESCUENTOS', v: `-${fmt(totalDisc)}`, c: C.red });
    finItems.push({ l: 'VALOR NETO', v: fmt(q.net_value), c: C.gold });
  } else {
    finItems.push({ l: 'VALOR TOTAL', v: fmt(q.net_value), c: C.gold });
  }
  finItems.push({ l: 'SEPARACIÓN', v: fmt(q.separation_amount), c: C.navy });
  finItems.push({ l: `CI (${Number(q.initial_payment_pct)}%)`, v: fmt(q.initial_payment_amount), c: C.navy });
  finItems.push({ l: `${q.num_installments} CUOTAS DE`, v: fmt(q.installment_amount), c: C.navy });
  finItems.push({ l: `FINANC. (${Number(q.financed_pct)}%)`, v: fmt(q.financed_amount), c: C.navy });

  const iw = W / finItems.length;
  finItems.forEach((item, i) => {
    const ix = M + i * iw;
    const lw = hv.widthOfTextAtSize(item.l, 7);
    page.drawText(item.l, { x: ix + (iw - lw) / 2, y: y - 18, size: 7, font: bd, color: C.textSec });
    const vw = bd.widthOfTextAtSize(item.v, 13);
    page.drawText(item.v, { x: ix + (iw - vw) / 2, y: y - 38, size: 13, font: bd, color: item.c });
  });

  y -= boxH + 18;

  // ═══════════════════════════════════════════════════
  // PAYMENT TABLE
  // ═══════════════════════════════════════════════════
  const plan = (q.payment_plan as Array<{ concepto: string; mes: string; pago: number; tipo: string }>) || [];

  newPageIfNeeded(36);
  page.drawText('PLAN DE PAGOS', { x: M, y, size: 8, font: bd, color: C.gold });
  drawRight(page, `${plan.length} conceptos`, hv, 8, RE, y, C.textTer);
  y -= 14;

  // Header row
  const rh = 18;
  page.drawRectangle({ x: M, y: y - rh, width: W, height: rh, color: C.goldBg });
  page.drawLine({ start: { x: M, y: y - rh }, end: { x: RE, y: y - rh }, thickness: 1.5, color: C.borderLight });
  const tc = { n: 30, c: W - 230, m: 120, v: 80 };
  page.drawText('#', { x: M + 8, y: y - 13, size: 8, font: bd, color: C.textSec });
  page.drawText('CONCEPTO', { x: M + tc.n + 8, y: y - 13, size: 8, font: bd, color: C.textSec });
  page.drawText('MES', { x: M + tc.n + tc.c + 8, y: y - 13, size: 8, font: bd, color: C.textSec });
  drawRight(page, 'VALOR', bd, 8, RE - 6, y - 13, C.textSec);
  y -= rh;

  for (let i = 0; i < plan.length; i++) {
    newPageIfNeeded(rh + 4);
    const r = plan[i];
    const isSep = r.concepto === 'Separación';
    const isSaldo = r.concepto?.includes('Saldo');
    const isTotal = r.tipo === 'total';
    const isAbono = r.tipo === 'abono';
    const isHL = isSep || isSaldo || isTotal;

    const bg = isHL ? C.goldBg : isAbono ? C.greenBg : i % 2 === 0 ? C.white : C.altRow;
    page.drawRectangle({ x: M, y: y - rh, width: W, height: rh, color: bg });
    page.drawLine({ start: { x: M, y: y - rh }, end: { x: RE, y: y - rh }, thickness: 0.5, color: C.borderLight });

    page.drawText(String(i + 1), { x: M + 8, y: y - 13, size: 9, font: hv, color: C.textTer });

    const cc = isSep ? C.gold : isAbono ? C.green : isHL ? C.navy : C.midnight;
    page.drawText(truncate(r.concepto || '', isHL ? bd : hv, 10, tc.c - 10), { x: M + tc.n + 8, y: y - 13, size: 10, font: isHL ? bd : hv, color: cc });

    page.drawText(r.mes || '', { x: M + tc.n + tc.c + 8, y: y - 13, size: 9, font: hv, color: C.textSec });

    const vc = isSep ? C.gold : isAbono ? C.green : C.navy;
    drawRight(page, fmt(r.pago), isHL ? bd : hv, 10, RE - 6, y - 13, vc);

    y -= rh;
  }

  // ═══════════════════════════════════════════════════
  // LEGAL
  // ═══════════════════════════════════════════════════
  newPageIfNeeded(60);
  y -= 12;
  page.drawLine({ start: { x: M, y }, end: { x: RE, y }, thickness: 0.5, color: C.border });
  y -= 14;

  const legal = '* El cliente cancela el 100% de los Gastos de Registro e Impuestos de Registro y asume el 50% de los Derechos Notariales. Los precios y condiciones de venta pueden ser modificados sin previo aviso. Esta cotización no constituye reserva ni compromiso de venta.';
  for (const line of wrapText(legal, hv, 8, W)) {
    page.drawText(line, { x: M, y, size: 8, font: hv, color: C.textTer });
    y -= 11;
  }
  y -= 2;
  page.drawText(`Vigencia de esta cotización: ${vigencia} días calendario a partir de la fecha de emisión.`, { x: M, y, size: 8, font: bd, color: C.textSec });

  // ═══════════════════════════════════════════════════
  // FOOTER
  // ═══════════════════════════════════════════════════
  y -= 20;
  page.drawLine({ start: { x: M, y }, end: { x: RE, y }, thickness: 0.5, color: C.borderLight });
  y -= 12;
  page.drawText(`Generado por FocuxAI Engine™ · ${new Date().toLocaleString('es-CO')}`, { x: M, y, size: 8, font: hv, color: C.textTer });
  drawRight(page, String(q.cot_number), hv, 8, RE, y, C.textTer);

  y -= 16;
  const brand = 'POWERED BY FOCUXAI ENGINE™ · FOCUX DIGITAL GROUP S.A.S.';
  const bw = bd.widthOfTextAtSize(brand, 7);
  page.drawText(brand, { x: M + (W - bw) / 2, y, size: 7, font: bd, color: C.gold });

  return await pdfDoc.save();
}
