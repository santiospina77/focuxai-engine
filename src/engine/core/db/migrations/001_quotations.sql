-- ═══════════════════════════════════════════════════════════
-- Migration 001: Tabla quotations
-- FocuxAI Engine™ — Cotizador Jiménez
--
-- Para ejecutar: copiar y pegar en Neon SQL Editor
-- o usar: psql $DATABASE_URL -f 001_quotations.sql
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS quotations (
  -- PK interno
  id              SERIAL PRIMARY KEY,

  -- Identificador público (COT-PSS-2604-0232)
  cot_number      TEXT NOT NULL UNIQUE,

  -- Cliente (multi-tenant)
  client_id       TEXT NOT NULL DEFAULT 'jimenez_demo',

  -- Comprador
  buyer_name      TEXT NOT NULL,
  buyer_lastname  TEXT NOT NULL,
  buyer_doc_type  TEXT NOT NULL DEFAULT 'CC',
  buyer_doc_number TEXT NOT NULL,
  buyer_email     TEXT NOT NULL,
  buyer_phone     TEXT NOT NULL,
  buyer_phone_cc  TEXT NOT NULL DEFAULT '+57',

  -- HubSpot contact (si existía al momento de cotizar)
  hubspot_contact_id TEXT,

  -- Inmueble
  macro_id        INTEGER NOT NULL,
  macro_name      TEXT NOT NULL,
  torre_id        INTEGER NOT NULL,
  torre_name      TEXT NOT NULL,
  unit_number     TEXT NOT NULL,
  unit_tipologia  TEXT,
  unit_piso       INTEGER,
  unit_area       NUMERIC(10,2) NOT NULL,
  unit_habs       INTEGER,
  unit_banos      INTEGER,
  unit_price      BIGINT NOT NULL,

  -- Parqueaderos y depósitos seleccionados (JSON arrays)
  parking         JSONB NOT NULL DEFAULT '[]',
  storage         JSONB NOT NULL DEFAULT '[]',
  includes_parking BOOLEAN NOT NULL DEFAULT false,
  includes_storage BOOLEAN NOT NULL DEFAULT false,

  -- Asesor
  advisor_id      TEXT NOT NULL,
  advisor_name    TEXT NOT NULL,

  -- Financiero
  sale_type       INTEGER NOT NULL DEFAULT 1,   -- 0=contado, 1=crédito, 2=leasing
  subtotal        BIGINT NOT NULL,
  discount_commercial BIGINT NOT NULL DEFAULT 0,
  discount_financial  BIGINT NOT NULL DEFAULT 0,
  total_discounts BIGINT NOT NULL DEFAULT 0,
  net_value       BIGINT NOT NULL,
  separation_amount BIGINT NOT NULL,
  initial_payment_pct NUMERIC(5,2) NOT NULL,
  initial_payment_amount BIGINT NOT NULL,
  num_installments INTEGER NOT NULL,
  installment_amount BIGINT NOT NULL,
  financed_amount BIGINT NOT NULL,
  financed_pct    NUMERIC(5,2) NOT NULL,

  -- Plan de pagos completo (JSON array of {concepto, mes, pago, tipo})
  payment_plan    JSONB NOT NULL DEFAULT '[]',

  -- Abonos extras
  bonuses         JSONB NOT NULL DEFAULT '[]',

  -- Config snapshot (vigencia, tasas, etc.)
  config_snapshot JSONB NOT NULL DEFAULT '{}',

  -- Estado
  status          TEXT NOT NULL DEFAULT 'sent',  -- sent | deal_created | expired | cancelled

  -- HubSpot Deal (se llena cuando se crea el deal)
  hubspot_deal_id TEXT,
  deal_created_at TIMESTAMPTZ,

  -- PDF
  pdf_url         TEXT,
  pdf_generated_at TIMESTAMPTZ,

  -- Timestamps
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Vigencia
  expires_at      TIMESTAMPTZ NOT NULL
);

-- Índices para queries frecuentes
CREATE INDEX IF NOT EXISTS idx_quotations_client_id ON quotations(client_id);
CREATE INDEX IF NOT EXISTS idx_quotations_buyer_email ON quotations(buyer_email);
CREATE INDEX IF NOT EXISTS idx_quotations_hubspot_deal ON quotations(hubspot_deal_id);
CREATE INDEX IF NOT EXISTS idx_quotations_status ON quotations(status);
CREATE INDEX IF NOT EXISTS idx_quotations_created_at ON quotations(created_at DESC);

-- Trigger para updated_at automático
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS quotations_updated_at ON quotations;
CREATE TRIGGER quotations_updated_at
  BEFORE UPDATE ON quotations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
