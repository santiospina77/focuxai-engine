/**
 * joinGroupingWithUnit — Enriquece agrupaciones con datos de su unidad principal.
 *
 * Camino principal: id_unidad_principal_sinco_fx → id_sinco_fx de Unidad
 * Fallback defensivo: match exacto único por nombre dentro del mismo proyecto
 *
 * SOLO unidades APT son candidatas a unidad principal.
 * Si id_unidad_principal_sinco_fx apunta a un PARQ/DEP → FAIL HARD.
 *
 * FAIL HARD rules (para agrupaciones_preestablecidas = true):
 *   - Agrupación DISPONIBLE sin match por FK NI por nombre → FAIL HARD del proyecto
 *   - Agrupación DISPONIBLE con 2+ matches por nombre → FAIL HARD del proyecto
 *   - Agrupación NO disponible (vendida/separada) sin match → excluir silenciosamente
 *   - Agrupación de OTRO proyecto → FAIL HARD (inconsistencia del dataset)
 *   - Unidad principal no es APT → FAIL HARD
 *
 * Pure function except for logging.
 */

import type { CrmRecord } from '@/engine/interfaces/ICrmAdapter';
import type { Logger } from '@/engine/core/logging/Logger';
import { normalizeUnitType } from './normalizeUnitType';

export interface JoinResult {
  /** Agrupaciones con unidad principal resuelta */
  readonly joined: readonly JoinedGrouping[];
  readonly stats: JoinStats;
}

export interface JoinedGrouping {
  readonly agrupacion: CrmRecord;
  readonly unidadPrincipal: CrmRecord;
  readonly joinMethod: 'fk' | 'nombre';
}

export interface JoinStats {
  readonly total: number;
  readonly joinedByFK: number;
  readonly joinedByNombre: number;
  readonly excludedNonDisponible: number;
}

export class JoinError extends Error {
  constructor(
    message: string,
    public readonly projectSincoId: number,
    public readonly agrupacionNombre: string,
  ) {
    super(message);
    this.name = 'JoinError';
  }
}

const DISPONIBLE_STATES = new Set(['disponible', 'Disponible', 'DISPONIBLE']);

/**
 * Valida que la unidad resuelta como principal sea un APT real.
 * Si id_unidad_principal_sinco_fx apunta a un PARQ/DEP → FAIL HARD.
 */
function assertUnitIsAPT(
  unit: CrmRecord,
  agrupNombre: string,
  projectSincoId: number,
  joinMethod: string,
): void {
  const tipoTexto = String(unit.properties['tipo_unidad_fx'] ?? '') || null;
  const tipoId = Number(unit.properties['tipo_unidad_sinco_fx']) || null;
  const tipo = normalizeUnitType(tipoTexto, tipoId);

  if (tipo !== 'APT') {
    throw new JoinError(
      `Agrupación "${agrupNombre}" en proyecto ${projectSincoId}: ` +
      `unidad principal "${unit.properties['nombre_fx']}" (sincoId=${unit.properties['id_sinco_fx']}) ` +
      `es ${tipo ?? 'DESCONOCIDO'}, no APT. Join method: ${joinMethod}. ` +
      `FAIL HARD: unidad principal debe ser apartamento.`,
      projectSincoId,
      agrupNombre,
    );
  }
}

export function joinGroupingsWithUnits(
  agrupaciones: readonly CrmRecord[],
  unidades: readonly CrmRecord[],
  projectSincoId: number,
  agrupacionesPreestablecidas: boolean,
  logger: Logger,
): JoinResult {
  // ── Build unit map by sincoId — FAIL HARD on duplicates ──
  const unidadMap = new Map<number, CrmRecord>();
  for (const u of unidades) {
    const sincoId = Number(u.properties['id_sinco_fx']);
    if (isNaN(sincoId) || sincoId <= 0) continue;

    // Verify unit belongs to this project
    const unitProjectId = Number(u.properties['id_proyecto_sinco_fx']);
    if (unitProjectId !== projectSincoId) continue;

    if (unidadMap.has(sincoId)) {
      throw new JoinError(
        `Duplicate id_sinco_fx=${sincoId} found in unidades for project ${projectSincoId}. ` +
        `Unit "${u.properties['nombre_fx']}" collides with "${unidadMap.get(sincoId)!.properties['nombre_fx']}". ` +
        `FAIL HARD: inventory data integrity violation.`,
        projectSincoId,
        String(u.properties['nombre_fx'] ?? ''),
      );
    }
    unidadMap.set(sincoId, u);
  }

  // ── Build unit map by nombre for fallback — ONLY units in this project ──
  const unidadByNombre = new Map<string, CrmRecord[]>();
  for (const u of unidades) {
    const unitProjectId = Number(u.properties['id_proyecto_sinco_fx']);
    if (unitProjectId !== projectSincoId) continue;

    const nombre = String(u.properties['nombre_fx'] ?? '').trim().toUpperCase();
    if (nombre) {
      const existing = unidadByNombre.get(nombre) ?? [];
      existing.push(u);
      unidadByNombre.set(nombre, existing);
    }
  }

  const joined: JoinedGrouping[] = [];
  let joinedByFK = 0;
  let joinedByNombre = 0;
  let excludedNonDisponible = 0;

  for (const agrup of agrupaciones) {
    const agrupNombre = String(agrup.properties['nombre_fx'] ?? '');
    const agrupEstado = String(agrup.properties['estado_fx'] ?? '');
    const idPrincipal = Number(agrup.properties['id_unidad_principal_sinco_fx']);
    const isDisponible = DISPONIBLE_STATES.has(agrupEstado);

    // ── Corrección GPT #1: Validar que la agrupación pertenece a este proyecto ──
    const agrupProjectId = Number(agrup.properties['id_proyecto_sinco_fx']);
    if (agrupProjectId !== projectSincoId) {
      throw new JoinError(
        `Agrupación "${agrupNombre}" tiene id_proyecto_sinco_fx=${agrupProjectId} ` +
        `pero se esperaba ${projectSincoId}. ` +
        `FAIL HARD: el caller pasó agrupaciones de otro proyecto al helper.`,
        projectSincoId,
        agrupNombre,
      );
    }

    // ── Camino A: FK por id_unidad_principal_sinco_fx ──
    if (!isNaN(idPrincipal) && idPrincipal > 0 && unidadMap.has(idPrincipal)) {
      const matched = unidadMap.get(idPrincipal)!;
      assertUnitIsAPT(matched, agrupNombre, projectSincoId, 'fk');
      joined.push({
        agrupacion: agrup,
        unidadPrincipal: matched,
        joinMethod: 'fk',
      });
      joinedByFK++;
      continue;
    }

    // ── Camino B: Fallback por nombre exacto único DENTRO DEL MISMO PROYECTO ──
    const agrupNombreUpper = agrupNombre.trim().toUpperCase();
    const nombreMatches = unidadByNombre.get(agrupNombreUpper) ?? [];

    if (nombreMatches.length === 1) {
      const matched = nombreMatches[0]!;
      assertUnitIsAPT(matched, agrupNombre, projectSincoId, 'nombre');
      logger.warn(
        { agrupNombre, projectSincoId, idPrincipal },
        'joinGroupingWithUnit: FK miss, resolved by nombre match',
      );
      joined.push({
        agrupacion: agrup,
        unidadPrincipal: matched,
        joinMethod: 'nombre',
      });
      joinedByNombre++;
      continue;
    }

    // ── Camino C: No match ──
    if (agrupacionesPreestablecidas && isDisponible) {
      // FAIL HARD: agrupación disponible en proyecto preestablecido sin join válido
      const reason = nombreMatches.length === 0
        ? `0 unidades matchean por nombre "${agrupNombre}"`
        : `${nombreMatches.length} unidades matchean por nombre "${agrupNombre}" (ambiguo)`;

      throw new JoinError(
        `Agrupación disponible "${agrupNombre}" (FK id_unidad_principal=${idPrincipal}) ` +
        `no se pudo unir a su unidad principal en proyecto ${projectSincoId}. ` +
        `${reason}. ` +
        `FAIL HARD: inconsistencia de inventario en proyecto con agrupaciones preestablecidas.`,
        projectSincoId,
        agrupNombre,
      );
    }

    // Non-disponible without match: exclude silently
    excludedNonDisponible++;
    logger.info(
      { agrupNombre, agrupEstado, projectSincoId },
      'joinGroupingWithUnit: non-disponible agrupación excluded (no join match)',
    );
  }

  return {
    joined,
    stats: {
      total: agrupaciones.length,
      joinedByFK,
      joinedByNombre,
      excludedNonDisponible,
    },
  };
}
