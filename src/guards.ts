import { ValidationError } from '@chat-adapter/shared'
import type { Message } from 'chat'
import type { MessageContext } from 'zaileys'
import { ZaileysAdapter } from './adapter.js'
import type { ZaileysRaw } from './types.js'

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

/**
 * The full zaileys `MessageContext` behind a Chat SDK message — flags
 * (`isGroup`, `isForwarded`, `isViewOnce`, …), lazy media (`media.buffer()`),
 * `replied()`, `reply()`, `react()`, citation, and the raw `WAMessage`.
 * `null` for messages without a live context (history fetches, sent echoes).
 *
 * ```typescript
 * bot.onSubscribedMessage(async (thread, message) => {
 *   const ctx = zaileysContext(message)
 *   if (ctx?.isForwarded) await ctx.react('👀')
 * })
 * ```
 */
export function zaileysContext(message: Message<ZaileysRaw> | Message<unknown>): MessageContext | null {
  const raw = (message as { raw?: unknown }).raw
  if (raw == null || typeof raw !== 'object') return null
  const context = (raw as ZaileysRaw).context
  return context ?? null
}
