/**
 * QuotationPdf — Componente @react-pdf/renderer para generar PDF de cotización.
 *
 * Reproduce la estructura visual del QuoterClient Step 6 pero en PDF nativo.
 * Colores Bluebox. Tipografías system (Helvetica) como fallback — @react-pdf no soporta
 * @font-face dinámico fácilmente. Se puede registrar fonts después si se quiere pixel-perfect.
 *
 * FocuxAI Engine™ — Deterministic. Auditable. Unstoppable.
 */

import React from 'react';
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';
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
  green: '#16A34A',
  red: '#DC2626',
};

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 10,
    fontFamily: 'Helvetica',
    color: C.midnight,
  },
  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 14,
    borderBottomWidth: 2,
    borderBottomColor: C.gold,
    marginBottom: 16,
  },
  headerLeft: { flexDirection: 'column' },
  companyName: { fontSize: 14, fontFamily: 'Helvetica-Bold', letterSpacing: 1.5, color: C.navy },
  companyNit: { fontSize: 9, color: C.textSec, marginTop: 2 },
  slogan: { fontSize: 8, color: C.gold, letterSpacing: 2, marginTop: 3, textTransform: 'uppercase' as const },
  headerRight: { alignItems: 'flex-end' as const },
  cotLabel: { fontSize: 8, letterSpacing: 1.5, color: C.gold, textTransform: 'uppercase' as const },
  cotNumber: { fontSize: 16, color: C.navy, fontFamily: 'Helvetica', fontWeight: 300 },
  cotDate: { fontSize: 9, color: C.textSec, marginTop: 2 },
  cotVigencia: { fontSize: 8, color: C.textTer, marginTop: 1 },

  // 3 columns
  columns: { flexDirection: 'row', marginBottom: 16, gap: 12 },
  col: { flex: 1 },
  colLabel: { fontSize: 7, letterSpacing: 1.5, color: C.gold, marginBottom: 4, textTransform: 'uppercase' as const, fontFamily: 'Helvetica-Bold' },
  colName: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: C.navy, marginBottom: 2 },
  colDetail: { fontSize: 9, color: C.textSec, marginBottom: 1 },

  // Financial summary
  finBox: { backgroundColor: C.sand, borderRadius: 6, padding: 12, marginBottom: 14, borderWidth: 1, borderColor: C.border },
  finRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  finItem: { flex: 1, alignItems: 'center' as const },
  finLabel: { fontSize: 7, letterSpacing: 1, color: C.textSec, textTransform: 'uppercase' as const, marginBottom: 2 },
  finValue: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: C.navy },
  finValueGold: { fontSize: 12, fontFamily: 'Helvetica-Bold', color: C.gold },

  // Payment table
  table: { marginBottom: 14 },
  tableHeader: { flexDirection: 'row', backgroundColor: C.sand, borderBottomWidth: 1, borderBottomColor: C.border, paddingVertical: 5, paddingHorizontal: 8 },
  tableRow: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: C.border, paddingVertical: 4, paddingHorizontal: 8 },
  tableRowAlt: { backgroundColor: '#F9F7F2' },
  tableRowHighlight: { backgroundColor: C.sand },
  thNum: { width: 25, fontSize: 7, letterSpacing: 1, color: C.textSec, textTransform: 'uppercase' as const, fontFamily: 'Helvetica-Bold' },
  thConcepto: { flex: 1, fontSize: 7, letterSpacing: 1, color: C.textSec, textTransform: 'uppercase' as const, fontFamily: 'Helvetica-Bold' },
  thMes: { width: 110, fontSize: 7, letterSpacing: 1, color: C.textSec, textTransform: 'uppercase' as const, fontFamily: 'Helvetica-Bold' },
  thValor: { width: 80, fontSize: 7, letterSpacing: 1, color: C.textSec, textTransform: 'uppercase' as const, fontFamily: 'Helvetica-Bold', textAlign: 'right' as const },
  tdNum: { width: 25, fontSize: 9, color: C.textTer },
  tdConcepto: { flex: 1, fontSize: 9, color: C.midnight },
  tdConceptoBold: { flex: 1, fontSize: 9, fontFamily: 'Helvetica-Bold', color: C.navy },
  tdMes: { width: 110, fontSize: 8, color: C.textSec },
  tdValor: { width: 80, fontSize: 9, color: C.navy, textAlign: 'right' as const },
  tdValorBold: { width: 80, fontSize: 9, fontFamily: 'Helvetica-Bold', color: C.navy, textAlign: 'right' as const },

  // Legal
  legal: { fontSize: 8, color: C.textTer, lineHeight: 1.5, borderTopWidth: 1, borderTopColor: C.border, paddingTop: 10, marginTop: 8 },
  legalBold: { fontSize: 8, color: C.textSec, fontFamily: 'Helvetica-Bold', marginTop: 4 },

  // Footer
  footer: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: C.border, paddingTop: 8, marginTop: 12 },
  footerText: { fontSize: 7, color: C.textTer, letterSpacing: 0.5 },
  footerBrand: { fontSize: 7, color: C.gold, fontFamily: 'Helvetica-Bold', letterSpacing: 1, textAlign: 'center' as const, marginTop: 6 },
});

// ── Helpers ──
function fmt(n: number): string {
  return `$ ${n.toLocaleString('es-CO')}`;
}

function formatDate(isoString: string): string {
  const d = new Date(isoString);
  return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
}

function vigenciaDays(config: Record<string, unknown>): number {
  return (config?.vigenciaDias as number) ?? 7;
}

// ── Component ──
interface Props {
  quotation: QuotationRow;
}

export function QuotationPdf({ quotation: q }: Props) {
  const paymentPlan = (q.payment_plan as Array<{ concepto: string; mes: string; pago: number; tipo: string }>) || [];
  const config = q.config_snapshot || {};

  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        {/* ══ HEADER ══ */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.companyName}>CONSTRUCTORA JIMÉNEZ S.A.</Text>
            <Text style={styles.companyNit}>NIT: 802.021.085-1 · Santa Marta, Colombia</Text>
            <Text style={styles.slogan}>Lo hacemos realidad</Text>
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.cotLabel}>Cotización</Text>
            <Text style={styles.cotNumber}>{q.cot_number}</Text>
            <Text style={styles.cotDate}>{formatDate(q.created_at)}</Text>
            <Text style={styles.cotVigencia}>Vigencia: {vigenciaDays(config)} días</Text>
          </View>
        </View>

        {/* ══ 3 COLUMNS ══ */}
        <View style={styles.columns}>
          <View style={styles.col}>
            <Text style={styles.colLabel}>Comprador</Text>
            <Text style={styles.colName}>{q.buyer_name} {q.buyer_lastname}</Text>
            <Text style={styles.colDetail}>{q.buyer_doc_type} {q.buyer_doc_number}</Text>
            <Text style={styles.colDetail}>{q.buyer_email}</Text>
            <Text style={styles.colDetail}>{q.buyer_phone_cc} {q.buyer_phone}</Text>
          </View>
          <View style={styles.col}>
            <Text style={styles.colLabel}>Inmueble</Text>
            <Text style={styles.colName}>{q.macro_name} — {q.torre_name}</Text>
            <Text style={styles.colDetail}>Apto {q.unit_number}{q.unit_tipologia ? ` · Tipo ${q.unit_tipologia}` : ''}{q.unit_piso != null ? ` · Piso ${q.unit_piso}` : ''}</Text>
            <Text style={styles.colDetail}>{q.unit_area} m²{q.unit_habs != null ? ` · ${q.unit_habs} hab` : ''}{q.unit_banos != null ? ` · ${q.unit_banos} baños` : ''}</Text>
            {q.includes_parking && <Text style={styles.colDetail}>Parqueadero incluido *</Text>}
            {q.includes_storage && <Text style={styles.colDetail}>Depósito incluido *</Text>}
          </View>
          <View style={styles.col}>
            <Text style={styles.colLabel}>Asesor</Text>
            <Text style={styles.colName}>{q.advisor_name}</Text>
            <Text style={styles.colDetail}>ID Sinco: {q.advisor_id}</Text>
            <Text style={styles.colDetail}>Tipo venta: {q.sale_type === 0 ? 'Contado' : q.sale_type === 1 ? 'Crédito' : 'Leasing'}</Text>
          </View>
        </View>

        {/* ══ FINANCIAL SUMMARY ══ */}
        <View style={styles.finBox}>
          <View style={styles.finRow}>
            {q.total_discounts > 0 && (
              <View style={styles.finItem}>
                <Text style={styles.finLabel}>Subtotal</Text>
                <Text style={styles.finValue}>{fmt(q.subtotal)}</Text>
              </View>
            )}
            {q.total_discounts > 0 && (
              <View style={styles.finItem}>
                <Text style={styles.finLabel}>Descuentos</Text>
                <Text style={{ ...styles.finValue, color: C.red }}>-{fmt(q.total_discounts)}</Text>
              </View>
            )}
            <View style={styles.finItem}>
              <Text style={styles.finLabel}>{q.total_discounts > 0 ? 'Valor Neto' : 'Valor Total'}</Text>
              <Text style={styles.finValueGold}>{fmt(q.net_value)}</Text>
            </View>
            <View style={styles.finItem}>
              <Text style={styles.finLabel}>Separación</Text>
              <Text style={styles.finValue}>{fmt(q.separation_amount)}</Text>
            </View>
            <View style={styles.finItem}>
              <Text style={styles.finLabel}>CI ({Number(q.initial_payment_pct)}%)</Text>
              <Text style={styles.finValue}>{fmt(q.initial_payment_amount)}</Text>
            </View>
            <View style={styles.finItem}>
              <Text style={styles.finLabel}>{q.num_installments} Cuotas de</Text>
              <Text style={styles.finValue}>{fmt(q.installment_amount)}</Text>
            </View>
            <View style={styles.finItem}>
              <Text style={styles.finLabel}>Financiación ({Number(q.financed_pct)}%)</Text>
              <Text style={styles.finValue}>{fmt(q.financed_amount)}</Text>
            </View>
          </View>
        </View>

        {/* ══ PAYMENT TABLE ══ */}
        <View style={styles.table}>
          <Text style={{ fontSize: 8, color: C.textSec, marginBottom: 4, fontFamily: 'Helvetica-Bold', letterSpacing: 1 }}>
            PLAN DE PAGOS — {paymentPlan.length} conceptos
          </Text>
          {/* Header */}
          <View style={styles.tableHeader}>
            <Text style={styles.thNum}>#</Text>
            <Text style={styles.thConcepto}>Concepto</Text>
            <Text style={styles.thMes}>Mes</Text>
            <Text style={styles.thValor}>Valor</Text>
          </View>
          {/* Rows */}
          {paymentPlan.map((r, i) => {
            const isSep = r.concepto === 'Separación';
            const isSaldo = r.concepto.includes('Saldo');
            const isTotal = r.tipo === 'total';
            const isHighlight = isSep || isSaldo || isTotal;
            return (
              <View
                key={i}
                style={[
                  styles.tableRow,
                  isHighlight ? styles.tableRowHighlight : i % 2 === 1 ? styles.tableRowAlt : {},
                ]}
              >
                <Text style={styles.tdNum}>{i + 1}</Text>
                <Text style={isHighlight ? styles.tdConceptoBold : styles.tdConcepto}>{r.concepto}</Text>
                <Text style={styles.tdMes}>{r.mes}</Text>
                <Text style={isHighlight ? styles.tdValorBold : styles.tdValor}>{fmt(r.pago)}</Text>
              </View>
            );
          })}
        </View>

        {/* ══ LEGAL ══ */}
        <View style={styles.legal}>
          <Text>* El cliente cancela el 100% de los Gastos de Registro e Impuestos de Registro y asume el 50% de los Derechos Notariales. Los precios y condiciones de venta pueden ser modificados sin previo aviso. Esta cotización no constituye reserva ni compromiso de venta.</Text>
          <Text style={styles.legalBold}>Vigencia de esta cotización: {vigenciaDays(config)} días calendario a partir de la fecha de emisión.</Text>
        </View>

        {/* ══ FOOTER ══ */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>Generado por FocuxAI Engine™ · {new Date().toLocaleString('es-CO')}</Text>
          <Text style={styles.footerText}>{q.cot_number}</Text>
        </View>
        <Text style={styles.footerBrand}>POWERED BY FOCUXAI ENGINE™ · FOCUX DIGITAL GROUP S.A.S.</Text>
      </Page>
    </Document>
  );
}
