-- ═══════════════════════════════════════════════════════════
-- Migration 002: PDF HubSpot traceability columns
-- FocuxAI Engine™ — Fase B.0
--
-- Adds columns to track PDF upload to client's HubSpot:
--   - pdf_hubspot_file_id   → HubSpot File Manager ID (primary traceability key)
--   - pdf_upload_status     → upload_failed | uploaded | attach_failed | attached
--   - pdf_upload_error      → Error detail if failed (truncated 500 chars)
--   - pdf_uploaded_at       → When HubSpot received the file
--   - pdf_hubspot_note_id   → HubSpot Note ID holding the attachment
--   - pdf_attached_at       → When the Note was associated to the Deal
--
-- Non-destructive: all columns are NULL, no existing data affected.
--
-- Run: copy/paste in Neon SQL Editor
-- or:  psql $DATABASE_URL -f 002_pdf_hubspot_columns.sql
-- ═══════════════════════════════════════════════════════════

-- New columns
ALTER TABLE quotations
  ADD COLUMN IF NOT EXISTS pdf_hubspot_file_id  TEXT          NULL,
  ADD COLUMN IF NOT EXISTS pdf_upload_status     TEXT          NULL,
  ADD COLUMN IF NOT EXISTS pdf_upload_error      TEXT          NULL,
  ADD COLUMN IF NOT EXISTS pdf_uploaded_at       TIMESTAMPTZ   NULL,
  ADD COLUMN IF NOT EXISTS pdf_hubspot_note_id   TEXT          NULL,
  ADD COLUMN IF NOT EXISTS pdf_attached_at       TIMESTAMPTZ   NULL;

-- Observaciones (added in earlier deploy, ensure it exists)
ALTER TABLE quotations
  ADD COLUMN IF NOT EXISTS observaciones TEXT NULL;

-- CHECK constraint: pdf_upload_status must be one of the known values or NULL
-- Drop first in case we need to re-run this migration
ALTER TABLE quotations
  DROP CONSTRAINT IF EXISTS quotations_pdf_upload_status_check;

ALTER TABLE quotations
  ADD CONSTRAINT quotations_pdf_upload_status_check
  CHECK (
    pdf_upload_status IS NULL
    OR pdf_upload_status IN (
      'upload_failed',
      'uploaded',
      'attach_failed',
      'attached'
    )
  );
