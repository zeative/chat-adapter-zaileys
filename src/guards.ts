import { ValidationError } from '@chat-adapter/shared'
import { ZaileysAdapter } from './adapter.js'

/** Type guard for narrowing a Chat SDK adapter to {@link ZaileysAdapter}. */
export function isZaileysAdapter(adapter: unknown): adapter is ZaileysAdapter {
  return adapter instanceof ZaileysAdapter
}

/**
 * Require that a Chat SDK context belongs to a {@link ZaileysAdapter}.
 * Accepts an adapter directly or any object with an `adapter` property
 * (`Thread`, `Channel`).
 */
export function requireZaileysAdapter(value: unknown): ZaileysAdapter {
  if (isZaileysAdapter(value)) return value
  const nested = (value as { adapter?: unknown } | null | undefined)?.adapter
  if (isZaileysAdapter(nested)) return nested
  throw new ValidationError('zaileys', 'Expected a ZaileysAdapter (or a Thread/Channel bound to one)')
}
