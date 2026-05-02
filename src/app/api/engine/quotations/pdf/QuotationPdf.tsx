/**
 * QuotationPdf — Componente @react-pdf/renderer para generar PDF de cotización.
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

// ── Builder function (returns Document element, not a React component) ──
export function buildQuotationPdf(q: QuotationRow) {
  const paymentPlan = (q.payment_plan as Array<{ concepto: string; mes: string; pago: number; tipo: string }>) || [];
  const config = q.config_snapshot || {};

  return (
    <Document>
      <Page size="LETTER" style={{ padding: 40, fontSize: 10, fontFamily: 'Helvetica', color: '#182633' }}>
        <Text style={{ fontSize: 14, fontFamily: 'Helvetica-Bold', color: '#2D4051' }}>
          {'CONSTRUCTORA JIMÉNEZ S.A.'}
        </Text>
        <Text style={{ fontSize: 10, color: '#5A6872', marginTop: 4 }}>
          {'Cotización: ' + String(q.cot_number)}
        </Text>
        <Text style={{ fontSize: 10, color: '#5A6872', marginTop: 4 }}>
          {'Comprador: ' + String(q.buyer_name) + ' ' + String(q.buyer_lastname)}
        </Text>
        <Text style={{ fontSize: 10, color: '#5A6872', marginTop: 4 }}>
          {'Valor Total: $ ' + String(q.net_value)}
        </Text>
        <Text style={{ fontSize: 8, color: '#8C9AA4', marginTop: 20 }}>
          {'Generado por FocuxAI Engine — Test mínimo'}
        </Text>
      </Page>
    </Document>
  );
}
