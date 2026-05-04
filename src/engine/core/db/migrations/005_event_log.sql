-- 005_event_log.sql
-- Event log para idempotencia cross-request de write-backs.
-- Cada transacción ERP se registra ANTES de ejecutar.
-- begin() usa INSERT ON CONFLICT DO NOTHING para atomic reserve.
--
-- WB-2 — CR v4 aprobado por Architect.

CREATE TABLE IF NOT EXISTS event_log (
  id              BIGSERIAL PRIMARY KEY,
  transaction_id  TEXT NOT NULL,
  client_id       TEXT NOT NULL,
  operation       TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending',
  payload         JSONB,
  output          JSONB,
  error_code      TEXT,
  error_message   TEXT,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at        TIMESTAMPTZ,
  duration_ms     INTEGER,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT event_log_status_check CHECK (status IN ('pending', 'success', 'failed')),
  CONSTRAINT event_log_transaction_id_unique UNIQUE (transaction_id)
);

-- Composite index para query() — reemplaza 4 índices individuales
CREATE INDEX IF NOT EXISTS idx_event_log_composite
  ON event_log (client_id, operation, status, started_at DESC);

-- Trigger para updated_at automático (idempotente: drop + create)
CREATE OR REPLACE FUNCTION update_event_log_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_event_log_updated_at ON event_log;

CREATE TRIGGER trg_event_log_updated_at
  BEFORE UPDATE ON event_log
  FOR EACH ROW
  EXECUTE FUNCTION update_event_log_updated_at();
