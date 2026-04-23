/**
 * pdfBuilder — Genera PDF de cotización con Puppeteer + @sparticuz/chromium.
 *
 * Renderiza HTML completo (mismo diseño que QuoterClient Step 6) como PDF.
 * Resultado visualmente idéntico al frontend.
 *
 * FocuxAI Engine™ — Deterministic. Auditable. Unstoppable.
 */

import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import type { QuotationRow } from '../types';

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

function esc(s: string | null | undefined): string {
  return (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Build HTML ──
function buildHtml(q: QuotationRow, baseUrl: string): string {
  const vigencia = ((q.config_snapshot as Record<string, number>)?.vigenciaDias) ?? 7;
  const totalDisc = Number(q.total_discounts) || 0;
  const paymentPlan = (q.payment_plan as Array<{ concepto: string; mes: string; pago: number; tipo: string }>) || [];
  const parkingArr = (q.parking as Array<{ numero: string }>) || [];
  const storageArr = (q.storage as Array<{ numero: string }>) || [];
  const saleLabel = Number(q.sale_type) === 0 ? 'Contado' : Number(q.sale_type) === 1 ? 'Crédito' : 'Leasing';
  const tipologia = q.unit_tipologia || '';

  // Financial items
  const finItems: Array<{ l: string; v: string; c?: string; bold?: boolean; hide?: boolean }> = [
    { l: 'Subtotal', v: fmt(q.subtotal), hide: totalDisc === 0 },
    { l: 'Descuentos', v: `-${fmt(totalDisc)}`, c: '#DC2626', hide: totalDisc === 0 },
    { l: totalDisc > 0 ? 'Valor Neto' : 'Valor Total', v: fmt(q.net_value), c: '#C2A360', bold: true },
    { l: 'Separación', v: fmt(q.separation_amount) },
    { l: `CI (${Number(q.initial_payment_pct)}%)`, v: fmt(q.initial_payment_amount), bold: true },
    { l: `${q.num_installments} cuotas de`, v: fmt(q.installment_amount) },
    { l: `Financiación (${Number(q.financed_pct)}%)`, v: fmt(q.financed_amount) },
  ].filter(m => !m.hide);

  // Payment rows HTML
  const paymentRowsHtml = paymentPlan.map((r, i) => {
    const isSep = r.concepto === 'Separación';
    const isSaldo = r.concepto?.includes('Saldo');
    const isTotal = r.tipo === 'total';
    const isAbono = r.tipo === 'abono';
    const isHighlight = isSep || isSaldo || isTotal;
    const bg = isHighlight ? '#FAF8F2' : isAbono ? '#F0FDF4' : i % 2 === 0 ? '#FFFFFF' : '#F9F7F2';
    const concColor = isSep ? '#C2A360' : isAbono ? '#16A34A' : isHighlight ? '#2D4051' : '#182633';
    const valColor = isSep ? '#C2A360' : isAbono ? '#16A34A' : '#2D4051';
    const fw = isHighlight ? '700' : '400';
    return `<tr style="background:${bg}">
      <td style="padding:6px 10px;font-size:11px;color:#8C9AA4;border-bottom:1px solid #EAE6DC">${i + 1}</td>
      <td style="padding:6px 10px;font-size:12px;font-weight:${fw};color:${concColor};border-bottom:1px solid #EAE6DC">${esc(r.concepto)}</td>
      <td style="padding:6px 10px;font-size:11px;color:#5A6872;border-bottom:1px solid #EAE6DC">${esc(r.mes)}</td>
      <td style="padding:6px 10px;font-size:12px;font-weight:${isHighlight ? '700' : '500'};color:${valColor};text-align:right;border-bottom:1px solid #EAE6DC">${fmt(r.pago)}</td>
    </tr>`;
  }).join('');

  // Parking/storage details
  let parkingHtml = '';
  if (parkingArr.length > 0) {
    parkingHtml = `<div style="font-size:12px;color:#5A6872">Parq: ${parkingArr.map(p => esc(p.numero)).join(', ')}</div>`;
  } else if (q.includes_parking) {
    parkingHtml = `<div style="font-size:12px;color:#5A6872">Parqueadero incluido *</div>`;
  }
  let storageHtml = '';
  if (storageArr.length > 0) {
    storageHtml = `<div style="font-size:12px;color:#5A6872">Dep: ${storageArr.map(d => esc(d.numero)).join(', ')}</div>`;
  } else if (q.includes_storage) {
    storageHtml = `<div style="font-size:12px;color:#5A6872">Depósito incluido *</div>`;
  }

  // Render + Plano images
  const imgSection = tipologia ? `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px" id="img-grid">
      ${['Render', 'Plano'].map(label => `
        <div class="img-card" style="border-radius:8px;overflow:hidden;border:1px solid #EAE6DC">
          <div style="padding:8px 12px;background:#FAF8F2;border-bottom:1px solid #EAE6DC">
            <span style="font-size:9px;letter-spacing:1.5px;text-transform:uppercase;color:#5A6872;font-weight:600">${label} — Tipo ${esc(tipologia)}</span>
          </div>
          <div style="display:flex;align-items:center;justify-content:center;background:#F5F3EE;min-height:180px">
            <img src="${baseUrl}/assets/${label.toLowerCase()}-${esc(tipologia)}.png" alt="${label} ${esc(tipologia)}"
              style="width:100%;height:auto;max-height:220px;object-fit:contain;display:block"
              onerror="this.closest('.img-card').style.display='none'" />
          </div>
        </div>
      `).join('')}
    </div>
  ` : '';

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color:#182633; padding:32px 36px; }
  .header { display:flex; justify-content:space-between; padding-bottom:18px; border-bottom:2px solid #C2A360; margin-bottom:20px; }
  .header-left { display:flex; align-items:center; gap:14px; }
  .header-left img { height:40px; width:auto; object-fit:contain; }
  .sello { height:32px !important; }
  .company-name { font-size:15px; font-weight:700; letter-spacing:2px; color:#2D4051; }
  .company-nit { font-size:10px; color:#5A6872; }
  .slogan { font-size:8px; letter-spacing:2px; color:#C2A360; text-transform:uppercase; font-weight:600; margin-top:2px; }
  .header-right { text-align:right; }
  .cot-label { font-size:8px; letter-spacing:1.5px; text-transform:uppercase; color:#C2A360; font-weight:700; }
  .cot-number { font-size:22px; font-weight:300; color:#2D4051; }
  .cot-date { font-size:11px; color:#5A6872; }
  .cot-vigencia { font-size:10px; color:#8C9AA4; }
  .label { font-size:9px; letter-spacing:1.5px; text-transform:uppercase; color:#C2A360; font-weight:700; margin-bottom:6px; }
  .columns { display:grid; grid-template-columns:1fr 1fr 1fr; gap:20px; margin-bottom:20px; }
  .col-name { font-size:14px; font-weight:600; color:#2D4051; margin-bottom:2px; }
  .col-detail { font-size:12px; color:#5A6872; line-height:1.5; }
  .fin-box { background:#FAF8F2; border-radius:8px; padding:16px; margin-bottom:18px; border:1px solid #EAE6DC; }
  .fin-grid { display:grid; gap:8px; }
  .fin-item { text-align:center; }
  .fin-label { font-size:9px; letter-spacing:1px; text-transform:uppercase; color:#5A6872; font-weight:600; margin-bottom:3px; }
  .fin-value { font-size:14px; font-weight:700; color:#2D4051; }
  .table-section { margin-bottom:18px; }
  .table-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; }
  table { width:100%; border-collapse:collapse; }
  th { padding:8px 10px; text-align:left; font-size:9px; letter-spacing:1.5px; text-transform:uppercase; color:#5A6872; border-bottom:2px solid #EAE6DC; font-weight:700; background:#FAF8F2; }
  th:last-child { text-align:right; }
  .legal { font-size:10px; color:#8C9AA4; line-height:1.6; border-top:1px solid #E0DCD2; padding-top:14px; }
  .legal-bold { font-weight:600; color:#5A6872; margin-top:6px; }
  .footer { margin-top:18px; padding-top:12px; border-top:1px solid #EAE6DC; display:flex; justify-content:space-between; align-items:center; }
  .footer-text { font-size:9px; color:#8C9AA4; letter-spacing:0.5px; }
  .footer-brand { text-align:center; margin-top:8px; font-size:8px; font-weight:700; color:#C2A360; letter-spacing:1.5px; }
</style>
</head>
<body>
  <!-- HEADER -->
  <div class="header">
    <div class="header-left">
      <img src="${baseUrl}/assets/logo-jimenez-horizontal.png" alt="Jiménez" onerror="this.style.display='none'" />
      <img src="${baseUrl}/assets/sello-40-anos.png" alt="40 Años" class="sello" onerror="this.style.display='none'" />
      <div>
        <div class="company-name">CONSTRUCTORA JIMÉNEZ S.A.</div>
        <div class="company-nit">NIT: 802.021.085-1 · Santa Marta, Colombia</div>
        <div class="slogan">Lo hacemos realidad</div>
      </div>
    </div>
    <div class="header-right">
      <div class="cot-label">Cotización</div>
      <div class="cot-number">${esc(String(q.cot_number))}</div>
      <div class="cot-date">${formatDate(q.created_at)}</div>
      <div class="cot-vigencia">Vigencia: ${vigencia} días</div>
    </div>
  </div>

  <!-- 3 COLUMNS -->
  <div class="columns">
    <div>
      <div class="label">Comprador</div>
      <div class="col-name">${esc(q.buyer_name)} ${esc(q.buyer_lastname)}</div>
      <div class="col-detail">${esc(q.buyer_doc_type)} ${esc(q.buyer_doc_number)}</div>
      <div class="col-detail">${esc(q.buyer_email)}</div>
      <div class="col-detail">${esc(q.buyer_phone_cc)} ${esc(q.buyer_phone)}</div>
    </div>
    <div>
      <div class="label">Inmueble</div>
      <div class="col-name">${esc(q.macro_name)} — ${esc(q.torre_name)}</div>
      <div class="col-detail">Apto ${esc(q.unit_number)}${q.unit_tipologia ? ` · Tipo ${esc(q.unit_tipologia)}` : ''}${q.unit_piso != null ? ` · Piso ${q.unit_piso}` : ''}</div>
      <div class="col-detail">${q.unit_area} m²${q.unit_habs != null ? ` · ${q.unit_habs} hab` : ''}${q.unit_banos != null ? ` · ${q.unit_banos} baños` : ''}</div>
      ${parkingHtml}
      ${storageHtml}
    </div>
    <div>
      <div class="label">Asesor</div>
      <div class="col-name">${esc(q.advisor_name)}</div>
      <div class="col-detail">Tipo venta: ${saleLabel}</div>
    </div>
  </div>

  <!-- RENDER + PLANO -->
  ${imgSection}

  <!-- FINANCIAL SUMMARY -->
  <div class="fin-box">
    <div class="fin-grid" style="grid-template-columns:repeat(${finItems.length},1fr)">
      ${finItems.map(m => `
        <div class="fin-item">
          <div class="fin-label">${esc(m.l)}</div>
          <div class="fin-value" style="color:${m.c || '#2D4051'}">${m.v}</div>
        </div>
      `).join('')}
    </div>
  </div>

  <!-- PAYMENT TABLE -->
  <div class="table-section">
    <div class="table-header">
      <div class="label" style="color:#C2A360;margin:0">Plan de Pagos</div>
      <span style="font-size:10px;color:#8C9AA4">${paymentPlan.length} conceptos</span>
    </div>
    <table>
      <thead><tr>
        <th>#</th><th>Concepto</th><th>Mes</th><th>Valor</th>
      </tr></thead>
      <tbody>${paymentRowsHtml}</tbody>
    </table>
  </div>

  <!-- LEGAL -->
  <div class="legal">
    <p>* El cliente cancela el 100% de los Gastos de Registro e Impuestos de Registro y asume el 50% de los Derechos Notariales. Los precios y condiciones de venta pueden ser modificados sin previo aviso. Esta cotización no constituye reserva ni compromiso de venta.</p>
    <p class="legal-bold">Vigencia de esta cotización: ${vigencia} días calendario a partir de la fecha de emisión.</p>
  </div>

  <!-- FOOTER -->
  <div class="footer">
    <span class="footer-text">Generado por FocuxAI Engine™ · ${new Date().toLocaleString('es-CO')}</span>
    <span class="footer-text">${esc(String(q.cot_number))}</span>
  </div>
  <div class="footer-brand">POWERED BY FOCUXAI ENGINE™ · FOCUX DIGITAL GROUP S.A.S.</div>
</body>
</html>`;
}

// ══════════════════════════════════════════════════════
// MAIN — HTML → PDF via Puppeteer
// ══════════════════════════════════════════════════════
export async function buildPdfBuffer(q: QuotationRow): Promise<Uint8Array> {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://engine.focux.co');

  const html = buildHtml(q, baseUrl);

  const browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath(),
    headless: true,
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });

    const pdfBuffer = await page.pdf({
      format: 'letter',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    });

    return new Uint8Array(pdfBuffer);
  } finally {
    await browser.close();
  }
}
