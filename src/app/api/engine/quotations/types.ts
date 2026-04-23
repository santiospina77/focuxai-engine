/**
 * Tipos compartidos para el módulo de cotizaciones.
 *
 * FocuxAI Engine™ — Deterministic. Auditable. Unstoppable.
 */

// ── Request body para POST /api/engine/quotations ──
export interface QuotationInput {
  clientId: string;
  cotNumber: string;

  // Comprador
  buyer: {
    name: string;
    lastname: string;
    docType: string;
    docNumber: string;
    email: string;
    phone: string;
    phoneCc: string;
    hubspotContactId?: string;
  };

  // Inmueble
  property: {
    macroId: number;
    macroName: string;
    torreId: number;
    torreName: string;
    unitNumber: string;
    unitTipologia: string | null;
    unitPiso: number | null;
    unitArea: number;
    unitHabs: number | null;
    unitBanos: number | null;
    unitPrice: number;
    parking: Array<{ numero: string; price: number }>;
    storage: Array<{ numero: string; price: number }>;
    includesParking: boolean;
    includesStorage: boolean;
  };

  // Asesor
  advisor: {
    id: number;
    name: string;
  };

  // Financiero
  financial: {
    saleType: number;        // 0=contado, 1=crédito, 2=leasing
    subtotal: number;
    discountCommercial: number;
    discountFinancial: number;
    totalDiscounts: number;
    netValue: number;
    separationAmount: number;
    initialPaymentPct: number;
    initialPaymentAmount: number;
    numInstallments: number;
    installmentAmount: number;
    financedAmount: number;
    financedPct: number;
    paymentPlan: Array<{
      concepto: string;
      mes: string;
      pago: number;
      tipo: string;
    }>;
    bonuses: Array<{
      label: string;
      amount: number;
      month: number;
    }>;
  };

  // Config snapshot
  config: {
    vigenciaDias: number;
    separacionPct: number;
    cuotaInicialPct: number;
    [key: string]: unknown;
  };
}

// ── Row from DB ──
export interface QuotationRow {
  id: number;
  cot_number: string;
  client_id: string;
  buyer_name: string;
  buyer_lastname: string;
  buyer_doc_type: string;
  buyer_doc_number: string;
  buyer_email: string;
  buyer_phone: string;
  buyer_phone_cc: string;
  hubspot_contact_id: string | null;
  macro_id: number;
  macro_name: string;
  torre_id: number;
  torre_name: string;
  unit_number: string;
  unit_tipologia: string | null;
  unit_piso: number | null;
  unit_area: number;
  unit_habs: number | null;
  unit_banos: number | null;
  unit_price: number;
  parking: unknown[];
  storage: unknown[];
  includes_parking: boolean;
  includes_storage: boolean;
  advisor_id: number;
  advisor_name: string;
  sale_type: number;
  subtotal: number;
  discount_commercial: number;
  discount_financial: number;
  total_discounts: number;
  net_value: number;
  separation_amount: number;
  initial_payment_pct: number;
  initial_payment_amount: number;
  num_installments: number;
  installment_amount: number;
  financed_amount: number;
  financed_pct: number;
  payment_plan: unknown[];
  bonuses: unknown[];
  config_snapshot: Record<string, unknown>;
  status: string;
  hubspot_deal_id: string | null;
  deal_created_at: string | null;
  pdf_url: string | null;
  pdf_generated_at: string | null;
  created_at: string;
  updated_at: string;
  expires_at: string;
}

// ── API Response ──
export interface QuotationCreated {
  success: true;
  quotation: {
    id: number;
    cotNumber: string;
    url: string;
    expiresAt: string;
    createdAt: string;
  };
}

export interface QuotationDetail {
  success: true;
  quotation: QuotationRow;
}

export interface ErrorResponse {
  error: string;
  message: string;
  timestamp: string;
}
