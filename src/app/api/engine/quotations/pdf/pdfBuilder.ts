/**
 * pdfBuilder v2 — World-class PDF cotización.
 *
 * Tipografías custom (AinslieSans + CarlaSans) embedidas via fontkit.
 * Rectángulos redondeados via SVG cubic bézier paths.
 * Layout replica pixel-for-pixel el QuoterClient Step 6 HTML.
 * Fallback automático a Helvetica si fonts custom no cargan.
 *
 * FocuxAI Engine™ — Deterministic. Auditable. Unstoppable.
 */

import { PDFDocument, StandardFonts, rgb, PDFPage, PDFFont, PDFImage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import type { QuotationRow } from '../types';

// ═══════════════════════════════════════════════════════════
// Design tokens
// ═══════════════════════════════════════════════════════════

function hex(c: string) {
  return rgb(
    parseInt(c.slice(1, 3), 16) / 255,
    parseInt(c.slice(3, 5), 16) / 255,
    parseInt(c.slice(5, 7), 16) / 255,
  );
}

const C = {
  gold:        hex('#C2A360'),
  goldBorder:  hex('#D4C28A'),
  navy:        hex('#2D4051'),
  midnight:    hex('#182633'),
  goldBg:      hex('#FAF8F2'),
  white:       hex('#FFFFFF'),
  textSec:     hex('#5A6872'),
  textTer:     hex('#8C9AA4'),
  border:      hex('#E0DCD2'),
  borderLight: hex('#EAE6DC'),
  green:       hex('#16A34A'),
  greenBg:     hex('#F0FDF4'),
  red:         hex('#DC2626'),
  altRow:      hex('#FAFAF8'),
  imgBg:       hex('#F5F3EE'),
};

type Color = ReturnType<typeof rgb>;

// ═══════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════

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
  let t = text;
  while (t.length > 0 && font.widthOfTextAtSize(t + '…', size) > maxW) t = t.slice(0, -1);
  return t + '…';
}

function drawRight(page: PDFPage, text: string, font: PDFFont, size: number, rx: number, y: number, color: Color) {
  page.drawText(text, { x: rx - font.widthOfTextAtSize(text, size), y, size, font, color });
}

function drawCenter(page: PDFPage, text: string, font: PDFFont, size: number, cx: number, y: number, color: Color) {
  page.drawText(text, { x: cx - font.widthOfTextAtSize(text, size) / 2, y, size, font, color });
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

/**
 * Rounded rectangle via SVG cubic bézier path.
 * (left, top) = top-left corner in PDF coordinates.
 * SVG path is drawn y-down, pdf-lib flips it automatically.
 */
function roundRect(
  page: PDFPage, left: number, top: number,
  w: number, h: number, r: number,
  fill?: Color, stroke?: Color, sw = 0,
) {
  if (r <= 0) {
    page.drawRectangle({ x: left, y: top - h, width: w, height: h, color: fill, borderColor: stroke, borderWidth: sw });
    return;
  }
  r = Math.min(r, w / 2, h / 2);
  const k = 0.5522847498 * r; // bézier approx for quarter circle
  const p = [
    `M ${r} 0`, `L ${w - r} 0`,
    `C ${w - r + k} 0 ${w} ${r - k} ${w} ${r}`,
    `L ${w} ${h - r}`,
    `C ${w} ${h - r + k} ${w - r + k} ${h} ${w - r} ${h}`,
    `L ${r} ${h}`,
    `C ${r - k} ${h} 0 ${h - r + k} 0 ${h - r}`,
    `L 0 ${r}`,
    `C 0 ${r - k} ${r - k} 0 ${r} 0`,
    'Z',
  ].join(' ');
  page.drawSvgPath(p, { x: left, y: top, color: fill, borderColor: stroke, borderWidth: sw });
}

/** Fetch binary asset from public URL */
async function fetchAsset(baseUrl: string, path: string): Promise<Uint8Array | null> {
  try {
    const res = await fetch(`${baseUrl}/${path}`);
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch { return null; }
}

async function embedImg(doc: PDFDocument, data: Uint8Array | null): Promise<PDFImage | null> {
  if (!data) return null;
  try { return await doc.embedPng(data); } catch {
    try { return await doc.embedJpg(data); } catch { return null; }
  }
}

// ═══════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════

export async function buildPdfBuffer(q: QuotationRow): Promise<Uint8Array> {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://engine.focux.co');

  const doc = await PDFDocument.create();

  // ── Register fontkit & embed custom fonts ──
  let R: PDFFont;  // AinslieSans Regular — body text
  let B: PDFFont;  // AinslieSans Bold    — emphasis
  let H: PDFFont;  // CarlaSans Bold      — headings/display
  try {
    doc.registerFontkit(fontkit);
    const [arBytes, abBytes, cbBytes] = await Promise.all([
      fetchAsset(baseUrl, 'fonts/AinslieSans-NorReg.otf'),
      fetchAsset(baseUrl, 'fonts/AinslieSans-NorBol.otf'),
      fetchAsset(baseUrl, 'fonts/CarlaSansBold.ttf'),
    ]);
    R = arBytes ? await doc.embedFont(arBytes) : await doc.embedFont(StandardFonts.Helvetica);
    B = abBytes ? await doc.embedFont(abBytes) : await doc.embedFont(StandardFonts.HelveticaBold);
    H = cbBytes ? await doc.embedFont(cbBytes) : await doc.embedFont(StandardFonts.HelveticaBold);
  } catch {
    R = await doc.embedFont(StandardFonts.Helvetica);
    B = await doc.embedFont(StandardFonts.HelveticaBold);
    H = await doc.embedFont(StandardFonts.HelveticaBold);
  }

  // Page dimensions — Letter
  const PW = 612, PH = 792, MG = 40;
  const W = PW - MG * 2;
  const RE = MG + W;

  let page = doc.addPage([PW, PH]);
  let y = PH - MG;

  function needPage(h: number) {
    if (y - h < MG + 24) { page = doc.addPage([PW, PH]); y = PH - MG; }
  }

  // ── Fetch all images in parallel ──
  const tip = q.unit_tipologia || '';
  const [logoData, selloData, renderData, planoData] = await Promise.all([
    fetchAsset(baseUrl, 'assets/logo-jimenez-horizontal.png'),
    fetchAsset(baseUrl, 'assets/sello-40-anos.png'),
    tip ? fetchAsset(baseUrl, `assets/render-${tip}.png`) : null,
    tip ? fetchAsset(baseUrl, `assets/plano-${tip}.png`) : null,
  ]);
  const [logoImg, selloImg, renderImg, planoImg] = await Promise.all([
    embedImg(doc, logoData), embedImg(doc, selloData),
    embedImg(doc, renderData), embedImg(doc, planoData),
  ]);

  // ═══════════════════════════════════════════════════════
  // HEADER
  // ═══════════════════════════════════════════════════════
  const hTop = y;
  let hx = MG;

  // Logo
  if (logoImg) {
    const lh = 42, lw = (logoImg.width / logoImg.height) * lh;
    page.drawImage(logoImg, { x: hx, y: y - lh + 6, width: lw, height: lh });
    hx += lw + 12;
  }

  // Sello 40 años
  if (selloImg) {
    const sh = 34, sw = (selloImg.width / selloImg.height) * sh;
    page.drawImage(selloImg, { x: hx, y: y - sh + 2, width: sw, height: sh });
    hx += sw + 16;
  }

  // ── Cotización badge (right) — calculated first to constrain company text ──
  const badgeW = 148, badgeH = 56;
  const badgeX = RE - badgeW;

  // Company text — constrained so it never overlaps badge
  const maxCompanyW = badgeX - hx - 14;
  page.drawText(truncate('CONSTRUCTORA JIMÉNEZ S.A.', H, 13, maxCompanyW), { x: hx, y: y - 4, size: 13, font: H, color: C.navy });
  page.drawText(truncate('NIT: 802.021.085-1 · Santa Marta, Colombia', R, 8.5, maxCompanyW), { x: hx, y: y - 18, size: 8.5, font: R, color: C.textSec });
  page.drawText('LO HACEMOS REALIDAD', { x: hx, y: y - 31, size: 7.5, font: H, color: C.gold });
  roundRect(page, badgeX, hTop + 4, badgeW, badgeH, 6, C.goldBg, C.goldBorder, 0.6);

  drawCenter(page, 'COTIZACIÓN', H, 7.5, badgeX + badgeW / 2, hTop - 8, C.gold);
  const cotStr = String(q.cot_number);
  const cotSize = cotStr.length > 20 ? 10 : cotStr.length > 16 ? 12 : 15;
  drawCenter(page, cotStr, R, cotSize, badgeX + badgeW / 2, hTop - 26, C.navy);
  drawCenter(page, fmtDate(q.created_at), R, 8, badgeX + badgeW / 2, hTop - 39, C.textSec);
  const vigencia = ((q.config_snapshot as Record<string, number>)?.vigenciaDias) ?? 7;
  drawCenter(page, `Vigencia: ${vigencia} días`, R, 7, badgeX + badgeW / 2, hTop - 50, C.textTer);

  // Gold separator
  y -= 60;
  page.drawLine({ start: { x: MG, y }, end: { x: RE, y }, thickness: 2, color: C.gold });

  // ═══════════════════════════════════════════════════════
  // 3-COLUMN INFO SECTION
  // ═══════════════════════════════════════════════════════
  y -= 26;
  const colGap = 16;
  const colW = (W - colGap * 2) / 3;

  function drawCol(x: number, label: string, name: string, lines: string[]) {
    let cy = y;
    page.drawText(label, { x, y: cy, size: 7.5, font: B, color: C.gold });
    cy -= 17;
    page.drawText(truncate(name, B, 12, colW), { x, y: cy, size: 12, font: B, color: C.navy });
    cy -= 15;
    for (const line of lines) {
      if (!line) continue;
      page.drawText(truncate(line, R, 9.5, colW), { x, y: cy, size: 9.5, font: R, color: C.textSec });
      cy -= 13;
    }
  }

  // Comprador
  drawCol(MG, 'COMPRADOR', `${q.buyer_name} ${q.buyer_lastname}`, [
    `${q.buyer_doc_type} ${q.buyer_doc_number}`,
    String(q.buyer_email),
    `${q.buyer_phone_cc || '+57'} ${q.buyer_phone}`,
  ]);

  // Inmueble
  const parkArr = (q.parking as Array<{ numero: string }>) || [];
  const stoArr = (q.storage as Array<{ numero: string }>) || [];
  const propLines: string[] = [];
  let unitLine = `Apto ${q.unit_number}`;
  if (q.unit_tipologia) unitLine += ` · Tipo ${q.unit_tipologia}`;
  if (q.unit_piso != null) unitLine += ` · Piso ${q.unit_piso}`;
  propLines.push(unitLine);
  let areaLine = `${q.unit_area} m²`;
  if (q.unit_habs != null) areaLine += ` · ${q.unit_habs} hab`;
  if (q.unit_banos != null) areaLine += ` · ${q.unit_banos} baños`;
  propLines.push(areaLine);
  if (parkArr.length > 0) propLines.push(`Parq: ${parkArr.map(p => p.numero).join(', ')}`);
  else if (q.includes_parking) propLines.push('Parqueadero incluido *');
  if (stoArr.length > 0) propLines.push(`Dep: ${stoArr.map(d => d.numero).join(', ')}`);
  else if (q.includes_storage) propLines.push('Depósito incluido *');
  drawCol(MG + colW + colGap, 'INMUEBLE', `${q.macro_name} — ${q.torre_name}`, propLines);

  // Asesor
  const saleLabel = Number(q.sale_type) === 0 ? 'Contado' : Number(q.sale_type) === 1 ? 'Crédito' : 'Leasing';
  drawCol(MG + (colW + colGap) * 2, 'ASESOR', String(q.advisor_name), [
    `ID Sinco: ${q.advisor_id}`,
    `Tipo venta: ${saleLabel}`,
  ]);

  y -= 84;

  // ═══════════════════════════════════════════════════════
  // RENDER + PLANO
  // ═══════════════════════════════════════════════════════
  if (renderImg || planoImg) {
    needPage(200);
    const imgBoxW = (W - 16) / 2;
    const labelH = 24;
    const imgAreaH = 160;

    const panels: Array<{ label: string; img: PDFImage | null; idx: number }> = [
      { label: `RENDER — Tipo ${tip}`, img: renderImg, idx: 0 },
      { label: `PLANO — Tipo ${tip}`, img: planoImg, idx: 1 },
    ];

    for (const { label, img, idx } of panels) {
      if (!img) continue;
      const ix = MG + idx * (imgBoxW + 16);

      // Container with rounded corners
      roundRect(page, ix, y, imgBoxW, labelH + imgAreaH, 8, undefined, C.borderLight, 0.5);

      // Label bar background (top)
      roundRect(page, ix, y, imgBoxW, labelH, 8, C.goldBg);
      // Clean bottom of label bar (overlap the rounded bottom corners)
      page.drawRectangle({ x: ix, y: y - labelH, width: imgBoxW, height: 10, color: C.goldBg });
      page.drawLine({ start: { x: ix, y: y - labelH }, end: { x: ix + imgBoxW, y: y - labelH }, thickness: 0.5, color: C.borderLight });

      page.drawText(label, { x: ix + 14, y: y - 16, size: 7.5, font: B, color: C.textSec });

      // Image area background
      page.drawRectangle({ x: ix + 0.5, y: y - labelH - imgAreaH + 8, width: imgBoxW - 1, height: imgAreaH - 8, color: C.imgBg });

      // Image scaled to fit
      const scale = Math.min((imgBoxW - 24) / img.width, (imgAreaH - 20) / img.height);
      const dw = img.width * scale, dh = img.height * scale;
      page.drawImage(img, {
        x: ix + (imgBoxW - dw) / 2,
        y: (y - labelH - imgAreaH) + (imgAreaH - dh) / 2,
        width: dw, height: dh,
      });
    }
    y -= labelH + imgAreaH + 20;
  }

  // ═══════════════════════════════════════════════════════
  // FINANCIAL SUMMARY
  // ═══════════════════════════════════════════════════════
  needPage(90);
  const totalDisc = Number(q.total_discounts) || 0;
  const bonuses = (q.bonuses as Array<{ label: string; amount: number }>) || [];
  const totalAbonos = bonuses.reduce((s, b) => s + (b.amount || 0), 0);

  const finItems: Array<{ l: string; v: string; c: Color; bold?: boolean }> = [];
  if (totalDisc > 0) {
    finItems.push({ l: 'SUBTOTAL', v: fmt(q.subtotal), c: C.navy });
    finItems.push({ l: 'DESCUENTOS', v: `-${fmt(totalDisc)}`, c: C.red });
  }
  finItems.push({ l: totalDisc > 0 ? 'VALOR NETO' : 'VALOR TOTAL', v: fmt(q.net_value), c: C.gold, bold: true });
  finItems.push({ l: 'SEPARACIÓN', v: fmt(q.separation_amount), c: C.navy });
  finItems.push({ l: `CI (${Number(q.initial_payment_pct)}%)`, v: fmt(q.initial_payment_amount), c: C.navy, bold: true });
  finItems.push({ l: `${q.num_installments} CUOTAS DE`, v: fmt(q.installment_amount), c: C.navy });
  finItems.push({ l: `FINANCIACIÓN (${Number(q.financed_pct)}%)`, v: fmt(q.financed_amount), c: C.navy });
  if (totalAbonos > 0) {
    finItems.push({ l: 'CUOTAS EXTRA', v: fmt(totalAbonos), c: C.green });
  }

  // ── 2-row layout: split items into rows of max 4 for breathing room ──
  const splitAt = finItems.length > 4 ? Math.min(3, finItems.length) : finItems.length;
  const row1 = finItems.slice(0, splitAt);
  const row2 = finItems.slice(splitAt);
  const numRows = row2.length > 0 ? 2 : 1;
  const rowH = 58;
  const gap = 6;
  const boxH = numRows === 2 ? rowH * 2 + gap : rowH;

  roundRect(page, MG, y, W, boxH, 8, C.goldBg, C.goldBorder, 0.6);

  // Divider between rows
  if (numRows === 2) {
    const divY = y - rowH;
    page.drawLine({ start: { x: MG + 16, y: divY }, end: { x: RE - 16, y: divY }, thickness: 0.5, color: C.borderLight });
  }

  function drawFinRow(items: typeof finItems, rowTop: number, rh: number) {
    const cellW = W / items.length;
    items.forEach((item, i) => {
      const cx = MG + i * cellW + cellW / 2;
      drawCenter(page, item.l, B, 7.5, cx, rowTop - 18, C.textSec);
      drawCenter(page, item.v, item.bold ? B : R, 13, cx, rowTop - 40, item.c);
    });
  }

  drawFinRow(row1, y, rowH);
  if (row2.length > 0) drawFinRow(row2, y - rowH - gap, rowH);

  y -= boxH + 22;

  // ═══════════════════════════════════════════════════════
  // PAYMENT TABLE
  // ═══════════════════════════════════════════════════════
  const plan = (q.payment_plan as Array<{ concepto: string; mes: string; pago: number; tipo: string }>) || [];

  needPage(44);
  page.drawText('PLAN DE PAGOS', { x: MG, y, size: 8.5, font: B, color: C.gold });
  drawRight(page, `${plan.length} conceptos`, R, 8.5, RE, y, C.textTer);
  y -= 18;

  // Table header
  const rh = 24;
  roundRect(page, MG, y, W, rh, 0, C.goldBg);
  page.drawLine({ start: { x: MG, y: y - rh }, end: { x: RE, y: y - rh }, thickness: 1.5, color: C.goldBorder });

  const tc = { num: 34, con: W - 250, mes: 126, val: 90 };
  page.drawText('#', { x: MG + 12, y: y - 16, size: 8, font: B, color: C.textSec });
  page.drawText('CONCEPTO', { x: MG + tc.num + 12, y: y - 16, size: 8, font: B, color: C.textSec });
  page.drawText('MES', { x: MG + tc.num + tc.con + 12, y: y - 16, size: 8, font: B, color: C.textSec });
  drawRight(page, 'VALOR', B, 8, RE - 10, y - 16, C.textSec);
  y -= rh;

  // Table rows
  for (let i = 0; i < plan.length; i++) {
    needPage(rh + 6);
    const row = plan[i];
    const isSep = row.concepto === 'Separación';
    const isSaldo = row.concepto?.includes('Saldo');
    const isTotal = row.tipo === 'total';
    const isAbono = row.tipo === 'abono';
    const isHL = isSep || isSaldo || isTotal;

    const bg = isHL ? C.goldBg : isAbono ? C.greenBg : i % 2 === 0 ? C.white : C.altRow;
    page.drawRectangle({ x: MG, y: y - rh, width: W, height: rh, color: bg });
    page.drawLine({ start: { x: MG, y: y - rh }, end: { x: RE, y: y - rh }, thickness: 0.5, color: C.borderLight });

    const ry = y - 16; // text baseline within row

    // #
    page.drawText(String(i + 1), { x: MG + 12, y: ry, size: 9, font: R, color: C.textTer });

    // Concepto
    const cc = isSep ? C.gold : isAbono ? C.green : isHL ? C.navy : C.midnight;
    const cf = isHL ? B : R;
    page.drawText(truncate(row.concepto || '', cf, 10.5, tc.con - 16), {
      x: MG + tc.num + 12, y: ry, size: 10.5, font: cf, color: cc,
    });

    // Mes
    page.drawText(row.mes || '', { x: MG + tc.num + tc.con + 12, y: ry, size: 9, font: R, color: C.textSec });

    // Valor
    const vc = isSep ? C.gold : isAbono ? C.green : C.navy;
    drawRight(page, fmt(row.pago), isHL ? B : R, 10.5, RE - 10, ry, vc);

    y -= rh;
  }

  // ═══════════════════════════════════════════════════════
  // LEGAL
  // ═══════════════════════════════════════════════════════
  needPage(75);
  y -= 16;
  page.drawLine({ start: { x: MG, y }, end: { x: RE, y }, thickness: 0.5, color: C.border });
  y -= 16;

  const legal = '* El cliente cancela el 100% de los Gastos de Registro e Impuestos de Registro y asume el 50% de los Derechos Notariales. Los precios y condiciones de venta pueden ser modificados sin previo aviso. Esta cotización no constituye reserva ni compromiso de venta.';
  for (const line of wrapText(legal, R, 8, W)) {
    page.drawText(line, { x: MG, y, size: 8, font: R, color: C.textTer });
    y -= 12;
  }
  y -= 4;
  page.drawText(`Vigencia de esta cotización: ${vigencia} días calendario a partir de la fecha de emisión.`, {
    x: MG, y, size: 8.5, font: B, color: C.textSec,
  });

  // ═══════════════════════════════════════════════════════
  // FOOTER
  // ═══════════════════════════════════════════════════════
  y -= 24;
  page.drawLine({ start: { x: MG, y }, end: { x: RE, y }, thickness: 0.5, color: C.borderLight });
  y -= 14;
  page.drawText(`Generado por FocuxAI Engine™ · ${new Date().toLocaleString('es-CO')}`, {
    x: MG, y, size: 8, font: R, color: C.textTer,
  });
  drawRight(page, String(q.cot_number), R, 8, RE, y, C.textTer);

  y -= 22;
  const brand = 'POWERED BY FOCUXAI ENGINE™ · FOCUX DIGITAL GROUP S.A.S.';
  drawCenter(page, brand, B, 7.5, MG + W / 2, y, C.gold);

  return await doc.save();
}
