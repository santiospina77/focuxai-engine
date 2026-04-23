/**
 * Neon Postgres — serverless connection pool.
 *
 * Usa @neondatabase/serverless con WebSocket para máxima compatibilidad
 * con Vercel Edge y Serverless Functions.
 *
 * Env var: DATABASE_URL (Neon connection string con pooler).
 *
 * FocuxAI Engine™ — Deterministic. Auditable. Unstoppable.
 */

import { neon } from '@neondatabase/serverless';

function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url || url.trim().length === 0) {
    throw new Error(
      'DATABASE_URL env var is not set. Add your Neon connection string to Vercel env vars.',
    );
  }
  return url;
}

/**
 * Returns a Neon SQL tagged template function.
 * Each call creates a fresh HTTP-based query — no persistent connection.
 * Perfect for serverless: zero cold-start overhead.
 */
export function getDb() {
  return neon(getDatabaseUrl());
}
