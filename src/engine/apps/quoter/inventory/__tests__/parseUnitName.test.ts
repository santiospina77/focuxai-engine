/**
 * Tests para parseUnitName — parser de coordenadas de grid.
 *
 * Requerimiento Architect (DATA-3 v2):
 *   APT-918  → numero "918",  piso 9,  pos "18"
 *   APT-1302 → numero "1302", piso 13, pos "02"
 *   1009     → numero "1009", piso 10, pos "09"
 *   APT-X    → piso 0 (GRID_COORDINATES_UNRESOLVED)
 */

import { parseUnitName } from '../parseUnitName';

describe('parseUnitName', () => {
  // ── APT con 3 dígitos ──
  it('APT-918 → numero 918, piso 9, pos 18', () => {
    const r = parseUnitName('APT-918');
    expect(r).toEqual({ numero: '918', piso: 9, pos: '18' });
  });

  it('APT-501 → numero 501, piso 5, pos 01', () => {
    const r = parseUnitName('APT-501');
    expect(r).toEqual({ numero: '501', piso: 5, pos: '01' });
  });

  // ── APT con 4 dígitos ──
  it('APT-1302 → numero 1302, piso 13, pos 02', () => {
    const r = parseUnitName('APT-1302');
    expect(r).toEqual({ numero: '1302', piso: 13, pos: '02' });
  });

  it('APT-1009 → numero 1009, piso 10, pos 09', () => {
    const r = parseUnitName('APT-1009');
    expect(r).toEqual({ numero: '1009', piso: 10, pos: '09' });
  });

  // ── Sin prefijo ──
  it('1009 (sin prefijo) → numero 1009, piso 10, pos 09', () => {
    const r = parseUnitName('1009');
    expect(r).toEqual({ numero: '1009', piso: 10, pos: '09' });
  });

  // ── APT-APTO variante ──
  it('APT-APTO501 → numero 501, piso 5, pos 01', () => {
    const r = parseUnitName('APT-APTO501');
    expect(r).toEqual({ numero: '501', piso: 5, pos: '01' });
  });

  // ── PARQ y DEP (menos de 3 dígitos → piso 0) ──
  it('PARQ-71 → numero 71, piso 0, pos 71', () => {
    const r = parseUnitName('PARQ-71');
    expect(r).toEqual({ numero: '71', piso: 0, pos: '71' });
  });

  it('DEP-2 → numero 2, piso 0, pos 02 (padStart)', () => {
    const r = parseUnitName('DEP-2');
    expect(r).toEqual({ numero: '2', piso: 0, pos: '02' });
  });

  it('DEP-15 → numero 15, piso 0, pos 15', () => {
    const r = parseUnitName('DEP-15');
    expect(r).toEqual({ numero: '15', piso: 0, pos: '15' });
  });

  // ── No numérico → piso 0 (caso de fallback) ──
  it('APT-X → piso 0 (grid coordinates unresolved)', () => {
    const r = parseUnitName('APT-X');
    expect(r.piso).toBe(0);
  });

  // ── Vacío ──
  it('string vacío → piso 0, pos 00', () => {
    const r = parseUnitName('');
    expect(r.piso).toBe(0);
    expect(r.pos).toBe('00');
  });

  // ── Case insensitive ──
  it('apt-918 (lowercase) → mismo resultado que APT-918', () => {
    const r = parseUnitName('apt-918');
    expect(r).toEqual({ numero: '918', piso: 9, pos: '18' });
  });
});
