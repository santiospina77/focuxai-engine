/**
 * Result<T, E> — Tipo para manejo explícito de éxito/error sin throws.
 *
 * Inspirado en Rust y en el patrón usado por Stripe SDK, este tipo obliga
 * a que cada operación que pueda fallar declare su error en el tipo de retorno.
 * Elimina la clase de bugs donde un throw no es manejado.
 *
 * Uso:
 *   const result = await sinco.getAgrupaciones(361);
 *   if (result.isErr()) {
 *     logger.error({ err: result.error }, 'Failed to fetch agrupaciones');
 *     return;
 *   }
 *   const agrupaciones = result.value; // tipado, no null
 */

export type Result<T, E = Error> = Ok<T, E> | Err<T, E>;

class Ok<T, E> {
  readonly _tag = 'Ok' as const;
  constructor(public readonly value: T) {}

  isOk(): this is Ok<T, E> {
    return true;
  }

  isErr(): this is Err<T, E> {
    return false;
  }

  map<U>(fn: (value: T) => U): Result<U, E> {
    return ok(fn(this.value));
  }

  mapErr<F>(_fn: (error: E) => F): Result<T, F> {
    return this as unknown as Result<T, F>;
  }

  andThen<U>(fn: (value: T) => Result<U, E>): Result<U, E> {
    return fn(this.value);
  }

  unwrap(): T {
    return this.value;
  }

  unwrapOr(_defaultValue: T): T {
    return this.value;
  }
}

class Err<T, E> {
  readonly _tag = 'Err' as const;
  constructor(public readonly error: E) {}

  isOk(): this is Ok<T, E> {
    return false;
  }

  isErr(): this is Err<T, E> {
    return true;
  }

  map<U>(_fn: (value: T) => U): Result<U, E> {
    return this as unknown as Result<U, E>;
  }

  mapErr<F>(fn: (error: E) => F): Result<T, F> {
    return err(fn(this.error));
  }

  andThen<U>(_fn: (value: T) => Result<U, E>): Result<U, E> {
    return this as unknown as Result<U, E>;
  }

  unwrap(): never {
    throw this.error instanceof Error
      ? this.error
      : new Error(`Called unwrap on Err: ${JSON.stringify(this.error)}`);
  }

  unwrapOr(defaultValue: T): T {
    return defaultValue;
  }
}

export function ok<T, E = never>(value: T): Result<T, E> {
  return new Ok(value);
}

export function err<T = never, E = Error>(error: E): Result<T, E> {
  return new Err(error);
}

/**
 * Helper para envolver promesas que hacen throw en Result.
 * Útil para integrar con librerías que no usan Result.
 */
export async function fromPromise<T, E = Error>(
  promise: Promise<T>,
  mapError: (err: unknown) => E
): Promise<Result<T, E>> {
  try {
    const value = await promise;
    return ok(value);
  } catch (error) {
    return err(mapError(error));
  }
}
