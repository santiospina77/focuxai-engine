-- 006_sinco_ids.sql
-- WB-3: Sinco ID propagation — selectedUnit → quotation → Deal mirror props → webhook
--
-- Tres campos semánticos:
--   sinco_agrupacion_id  — ID de agrupación Sinco (solo cuando selectionMode='agrupacion')
--   sinco_unidad_id      — ID de unidad Sinco (solo cuando selectionMode='unidad')
--   sinco_proyecto_id    — ID de proyecto Sinco (siempre, = torre.sincoId)
--
-- Nullable: cotizaciones sin IDs quedan como NULL → operador los llena manualmente.
-- CHECK: si existe, debe ser positivo (nunca 0 ni negativo).
--
-- FocuxAI Engine™ — Deterministic. Auditable. Unstoppable.

ALTER TABLE quotations
  ADD COLUMN IF NOT EXISTS sinco_agrupacion_id INTEGER,
  ADD COLUMN IF NOT EXISTS sinco_unidad_id INTEGER,
  ADD COLUMN IF NOT EXISTS sinco_proyecto_id INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_quotations_sinco_agrupacion_id_positive'
  ) THEN
    ALTER TABLE quotations
      ADD CONSTRAINT chk_quotations_sinco_agrupacion_id_positive
      CHECK (sinco_agrupacion_id IS NULL OR sinco_agrupacion_id > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_quotations_sinco_unidad_id_positive'
  ) THEN
    ALTER TABLE quotations
      ADD CONSTRAINT chk_quotations_sinco_unidad_id_positive
      CHECK (sinco_unidad_id IS NULL OR sinco_unidad_id > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_quotations_sinco_proyecto_id_positive'
  ) THEN
    ALTER TABLE quotations
      ADD CONSTRAINT chk_quotations_sinco_proyecto_id_positive
      CHECK (sinco_proyecto_id IS NULL OR sinco_proyecto_id > 0);
  END IF;
END $$;
