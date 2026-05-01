-- ═══════════════════════════════════════════════════════════
-- Migration 003: Add 'generation_failed' to pdf_upload_status CHECK
-- FocuxAI Engine™ — Fase B.0
--
-- Separates PDF generation failure from HubSpot upload failure.
-- Enables targeted retries:
--   generation_failed → retry from buildPdfBuffer
--   upload_failed     → retry from uploadFileToHubSpot
--   attach_failed     → retry from attachFileToRecord (reuse fileId)
--
-- Non-destructive: existing data unaffected.
--
-- Run: paste in Neon SQL Editor
-- ═══════════════════════════════════════════════════════════

ALTER TABLE quotations
  DROP CONSTRAINT IF EXISTS quotations_pdf_upload_status_check;

ALTER TABLE quotations
  ADD CONSTRAINT quotations_pdf_upload_status_check
  CHECK (
    pdf_upload_status IS NULL
    OR pdf_upload_status IN (
      'generation_failed',
      'upload_failed',
      'uploaded',
      'attach_failed',
      'attached'
    )
  );
