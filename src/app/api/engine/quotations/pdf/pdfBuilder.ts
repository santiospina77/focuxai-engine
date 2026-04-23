/**
 * pdfBuilder — Genera PDF de cotización con PDFKit (puro Node.js, sin React).
 *
 * Reproduce el diseño Bluebox del cotizador:
 * - Header con nombre empresa + cotización
 * - 3 columnas: comprador, inmueble, asesor
 * - Resumen financiero
 * - Tabla plan de pagos
 * - Legal + footer
 *
 * FocuxAI Engine™ — Deterministic. Auditable. Unstoppable.
 */

import PDFDocument from 'pdfkit';
import type { QuotationRow } from '../types';

// ── Bluebox Brand Colors ──
const C = {
  gold: '#C2A360',
  navy: '#2D4051',
  midnight: '#182633',
  sand: '#F4F0E5',
  white: '#FFFFFF',
  textSec: '#5A6872',
  textTer: '#8C9AA4',
  border: '#E0DCD2',
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
export async function buildPdfBuffer(q: QuotationRow): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'LETTER', margin: 40 });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const W = 612 - 80; // Page width minus margins
      const pageLeft = 40;

      // ═══════════════════════════════════════════════════
      // HEADER
      // ═══════════════════════════════════════════════════
      doc.font('Helvetica-Bold').fontSize(14).fillColor(C.navy)
        .text('CONSTRUCTORA JIMÉNEZ S.A.', pageLeft, 40);
      doc.font('Helvetica').fontSize(9).fillColor(C.textSec)
        .text('NIT: 802.021.085-1 · Santa Marta, Colombia', pageLeft, 58);
      doc.font('Helvetica').fontSize(8).fillColor(C.gold)
        .text('LO HACEMOS REALIDAD', pageLeft, 70);

      // Right side — cotización info
      doc.font('Helvetica').fontSize(8).fillColor(C.gold)
        .text('COTIZACIÓN', 400, 40, { width: W - 360, align: 'right' });
      doc.font('Helvetica').fontSize(16).fillColor(C.navy)
        .text(String(q.cot_number), 400, 52, { width: W - 360, align: 'right' });
      doc.font('Helvetica').fontSize(9).fillColor(C.textSec)
        .text(formatDate(q.created_at), 400, 72, { width: W - 360, align: 'right' });

      const vigencia = (q.config_snapshot as Record<string, number>)?.vigenciaDias ?? 7;
      doc.font('Helvetica').fontSize(8).fillColor(C.textTer)
        .text(`Vigencia: ${vigencia} días`, 400, 84, { width: W - 360, align: 'right' });

      // Gold line
      doc.moveTo(pageLeft, 98).lineTo(pageLeft + W, 98).strokeColor(C.gold).lineWidth(2).stroke();

      // ═══════════════════════════════════════════════════
      // 3 COLUMNS
      // ═══════════════════════════════════════════════════
      let y = 110;
      const colW = W / 3 - 8;

      // Col 1 — Comprador
      doc.font('Helvetica-Bold').fontSize(7).fillColor(C.gold).text('COMPRADOR', pageLeft, y);
      y += 12;
      doc.font('Helvetica-Bold').fontSize(11).fillColor(C.navy)
        .text(`${q.buyer_name} ${q.buyer_lastname}`, pageLeft, y);
      y += 14;
      doc.font('Helvetica').fontSize(9).fillColor(C.textSec)
        .text(`${q.buyer_doc_type} ${q.buyer_doc_number}`, pageLeft, y);
      y += 11;
      doc.text(String(q.buyer_email), pageLeft, y);
      y += 11;
      doc.text(`${q.buyer_phone_cc} ${q.buyer_phone}`, pageLeft, y);

      // Col 2 — Inmueble
      const col2x = pageLeft + colW + 12;
      y = 110;
      doc.font('Helvetica-Bold').fontSize(7).fillColor(C.gold).text('INMUEBLE', col2x, y);
      y += 12;
      doc.font('Helvetica-Bold').fontSize(11).fillColor(C.navy)
        .text(`${q.macro_name} — ${q.torre_name}`, col2x, y, { width: colW });
      y += 14;
      let unitDetail = `Apto ${q.unit_number}`;
      if (q.unit_tipologia) unitDetail += ` · Tipo ${q.unit_tipologia}`;
      if (q.unit_piso != null) unitDetail += ` · Piso ${q.unit_piso}`;
      doc.font('Helvetica').fontSize(9).fillColor(C.textSec).text(unitDetail, col2x, y, { width: colW });
      y += 11;
      let areaDetail = `${q.unit_area} m²`;
      if (q.unit_habs != null) areaDetail += ` · ${q.unit_habs} hab`;
      if (q.unit_banos != null) areaDetail += ` · ${q.unit_banos} baños`;
      doc.text(areaDetail, col2x, y, { width: colW });

      // Col 3 — Asesor
      const col3x = pageLeft + (colW + 12) * 2;
      y = 110;
      doc.font('Helvetica-Bold').fontSize(7).fillColor(C.gold).text('ASESOR', col3x, y);
      y += 12;
      doc.font('Helvetica-Bold').fontSize(11).fillColor(C.navy).text(String(q.advisor_name), col3x, y, { width: colW });
      y += 14;
      const saleLabel = Number(q.sale_type) === 0 ? 'Contado' : Number(q.sale_type) === 1 ? 'Crédito' : 'Leasing';
      doc.font('Helvetica').fontSize(9).fillColor(C.textSec).text(`Tipo venta: ${saleLabel}`, col3x, y, { width: colW });

      // ═══════════════════════════════════════════════════
      // FINANCIAL SUMMARY BOX
      // ═══════════════════════════════════════════════════
      y = 190;
      const boxH = 50;
      doc.roundedRect(pageLeft, y, W, boxH, 4).fillAndStroke(C.sand, C.border);

      const totalDisc = Number(q.total_discounts) || 0;
      const finItems: Array<{ label: string; value: string; highlight?: boolean }> = [];

      if (totalDisc > 0) {
        finItems.push({ label: 'Subtotal', value: fmt(q.subtotal) });
        finItems.push({ label: 'Descuentos', value: `-${fmt(totalDisc)}` });
        finItems.push({ label: 'Valor Neto', value: fmt(q.net_value), highlight: true });
      } else {
        finItems.push({ label: 'Valor Total', value: fmt(q.net_value), highlight: true });
      }
      finItems.push({ label: 'Separación', value: fmt(q.separation_amount) });
      finItems.push({ label: `CI (${Number(q.initial_payment_pct)}%)`, value: fmt(q.initial_payment_amount) });
      finItems.push({ label: `${q.num_installments} Cuotas de`, value: fmt(q.installment_amount) });
      finItems.push({ label: `Financ. (${Number(q.financed_pct)}%)`, value: fmt(q.financed_amount) });

      const itemW = W / finItems.length;
      finItems.forEach((item, i) => {
        const ix = pageLeft + i * itemW;
        doc.font('Helvetica').fontSize(6).fillColor(C.textSec)
          .text(item.label.toUpperCase(), ix + 4, y + 10, { width: itemW - 8, align: 'center' });
        doc.font('Helvetica-Bold').fontSize(10).fillColor(item.highlight ? C.gold : C.navy)
          .text(item.value, ix + 4, y + 22, { width: itemW - 8, align: 'center' });
      });

      // ═══════════════════════════════════════════════════
      // PAYMENT TABLE
      // ═══════════════════════════════════════════════════
      y = 255;
      const paymentPlan = (q.payment_plan as Array<{ concepto: string; mes: string; pago: number; tipo: string }>) || [];

      doc.font('Helvetica-Bold').fontSize(8).fillColor(C.textSec)
        .text(`PLAN DE PAGOS — ${paymentPlan.length} conceptos`, pageLeft, y);
      y += 14;

      // Table header
      const cols = { num: 25, concepto: W - 215, mes: 110, valor: 80 };
      doc.rect(pageLeft, y, W, 16).fill(C.sand);
      doc.font('Helvetica-Bold').fontSize(7).fillColor(C.textSec);
      doc.text('#', pageLeft + 4, y + 5, { width: cols.num });
      doc.text('CONCEPTO', pageLeft + cols.num + 4, y + 5, { width: cols.concepto });
      doc.text('MES', pageLeft + cols.num + cols.concepto + 4, y + 5, { width: cols.mes });
      doc.text('VALOR', pageLeft + W - cols.valor, y + 5, { width: cols.valor - 4, align: 'right' });
      y += 16;

      // Table rows
      paymentPlan.forEach((r, i) => {
        const isSep = r.concepto === 'Separación';
        const isSaldo = r.concepto?.includes('Saldo');
        const isTotal = r.tipo === 'total';
        const isHighlight = isSep || isSaldo || isTotal;
        const rowH = 14;

        if (isHighlight) {
          doc.rect(pageLeft, y, W, rowH).fill(C.sand);
        } else if (i % 2 === 1) {
          doc.rect(pageLeft, y, W, rowH).fill('#F9F7F2');
        }

        doc.font('Helvetica').fontSize(8).fillColor(C.textTer)
          .text(String(i + 1), pageLeft + 4, y + 3, { width: cols.num });
        doc.font(isHighlight ? 'Helvetica-Bold' : 'Helvetica').fontSize(9).fillColor(isHighlight ? C.navy : C.midnight)
          .text(r.concepto, pageLeft + cols.num + 4, y + 3, { width: cols.concepto });
        doc.font('Helvetica').fontSize(8).fillColor(C.textSec)
          .text(r.mes || '', pageLeft + cols.num + cols.concepto + 4, y + 3, { width: cols.mes });
        doc.font(isHighlight ? 'Helvetica-Bold' : 'Helvetica').fontSize(9).fillColor(C.navy)
          .text(fmt(r.pago), pageLeft + W - cols.valor, y + 3, { width: cols.valor - 4, align: 'right' });

        // Bottom border
        doc.moveTo(pageLeft, y + rowH).lineTo(pageLeft + W, y + rowH).strokeColor(C.border).lineWidth(0.5).stroke();
        y += rowH;
      });

      // ═══════════════════════════════════════════════════
      // LEGAL
      // ═══════════════════════════════════════════════════
      y += 12;
      doc.moveTo(pageLeft, y).lineTo(pageLeft + W, y).strokeColor(C.border).lineWidth(0.5).stroke();
      y += 8;

      doc.font('Helvetica').fontSize(8).fillColor(C.textTer)
        .text('* El cliente cancela el 100% de los Gastos de Registro e Impuestos de Registro y asume el 50% de los Derechos Notariales. Los precios y condiciones de venta pueden ser modificados sin previo aviso. Esta cotización no constituye reserva ni compromiso de venta.', pageLeft, y, { width: W, lineGap: 2 });

      y = doc.y + 6;
      doc.font('Helvetica-Bold').fontSize(8).fillColor(C.textSec)
        .text(`Vigencia de esta cotización: ${vigencia} días calendario a partir de la fecha de emisión.`, pageLeft, y, { width: W });

      // ═══════════════════════════════════════════════════
      // FOOTER
      // ═══════════════════════════════════════════════════
      y = doc.y + 16;
      doc.moveTo(pageLeft, y).lineTo(pageLeft + W, y).strokeColor(C.border).lineWidth(0.5).stroke();
      y += 6;

      doc.font('Helvetica').fontSize(7).fillColor(C.textTer)
        .text(`Generado por FocuxAI Engine™ · ${new Date().toLocaleString('es-CO')}`, pageLeft, y);
      doc.text(String(q.cot_number), pageLeft, y, { width: W, align: 'right' });

      y += 12;
      doc.font('Helvetica-Bold').fontSize(7).fillColor(C.gold)
        .text('POWERED BY FOCUXAI ENGINE™ · FOCUX DIGITAL GROUP S.A.S.', pageLeft, y, { width: W, align: 'center' });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
