/**
 * parseUnitName — Extrae numero, piso y posición del nombre de una unidad Sinco.
 *
 * Basado en la lógica del QuoterClient actual (líneas 140-143), extendido
 * para manejar prefijos adicionales (PARQ-, DEP-, APT-APTO).
 *
 * Reglas de piso (del QuoterClient):
 *   3 dígitos: primer dígito = piso (501 → piso 5)
 *   4+ dígitos: primeros 2 dígitos = piso (1302 → piso 13)
 *   <3 dígitos o no numérico: piso 0
 *
 * Regla de pos: últimos 2 dígitos siempre. Si <2 dígitos → padStart(2, '0').
 *
 * Ejemplos:
 *   "APT-918"      → { numero: "918",  piso: 9,  pos: "18" }
 *   "APT-1302"     → { numero: "1302", piso: 13, pos: "02" }
 *   "APT-APTO501"  → { numero: "501",  piso: 5,  pos: "01" }
 *   "PARQ-71"      → { numero: "71",   piso: 0,  pos: "71" }
 *   "DEP-2"        → { numero: "2",    piso: 0,  pos: "02" }  // padStart
 *   "DEP-15"       → { numero: "15",   piso: 0,  pos: "15" }
 *
 * Pure function. No side effects. No dependencies.
 */

export interface ParsedUnitName {
  readonly numero: string;
  readonly piso: number;
  readonly pos: string;
}

export function parseUnitName(nombre: string): ParsedUnitName {
  // Strip known prefixes to get the numeric part
  let num = nombre
    .replace(/^APT-APTO/i, '')
    .replace(/^APT-/i, '')
    .replace(/^PARQ-/i, '')
    .replace(/^DEP-/i, '')
    .trim();

  // If after stripping we have nothing, return zeros
  if (!num || num.length === 0) {
    return { numero: nombre, piso: 0, pos: '00' };
  }

  // Extract only trailing digits (handles cases like "APTO1302" → "1302")
  const digitMatch = num.match(/(\d+)$/);
  if (!digitMatch) {
    return { numero: num, piso: 0, pos: num.substring(Math.max(0, num.length - 2)) };
  }

  const digits = digitMatch[1]!;
  const numero = digits;

  // Piso logic — from QuoterClient:
  // 3 digits: first digit = piso (501 → piso 5)
  // 4+ digits: first 2 digits = piso (1302 → piso 13)
  // anything else: piso 0
  let piso = 0;
  if (digits.length === 3) {
    piso = parseInt(digits[0]!, 10);
  } else if (digits.length >= 4) {
    piso = parseInt(digits.substring(0, 2), 10);
  }

  // Pos = last 2 digits always. If <2 digits → padStart with '0'.
  const pos = digits.length >= 2
    ? digits.substring(digits.length - 2)
    : digits.padStart(2, '0');

  return { numero, piso, pos };
}
