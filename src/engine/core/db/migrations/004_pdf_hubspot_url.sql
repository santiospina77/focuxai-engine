-- ═══════════════════════════════════════════════════════════
-- Migration 004: Add pdf_hubspot_url column
-- FocuxAI Engine™ — Fase B.0
--
-- Stores the public HubSpot CDN URL for the quotation PDF.
-- Used as the client-facing link (emails, WhatsApp).
-- No "focux" in the URL — lives in client's HubSpot ecosystem.
--
-- Run: paste in Neon SQL Editor
-- ═══════════════════════════════════════════════════════════

ALTER TABLE quotations
  ADD COLUMN IF NOT EXISTS pdf_hubspot_url TEXT DEFAULT NULL;
