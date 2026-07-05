import { ValidationError } from '@chat-adapter/shared'
import { Client, type ClientOptions } from 'zaileys'
import { ZaileysAdapter } from './adapter.js'
import type { ZaileysAdapterConfig } from './types.js'

/** Options for {@link createZaileysAdapter}. */
export type CreateZaileysAdapterOptions = Omit<ZaileysAdapterConfig, 'client'> & {
  /** Bring your own zaileys client… */
  client?: Client
  /** …or let the factory create one from zaileys `ClientOptions` (sessionId, authType, phoneNumber, store, …). */
  session?: ClientOptions
}

/**
 * Create a WhatsApp adapter for Chat SDK powered by zaileys.
 *
 * @example
 * ```typescript
 * import { Chat } from "chat";
 * import { createZaileysAdapter } from "chat-adapter-zaileys";
 *
 * const whatsapp = createZaileysAdapter({
 *   session: { sessionId: "main" }, // QR prints to terminal on first run
 * });
 *
 * const bot = new Chat({
 *   userName: "mybot",
 *   adapters: { whatsapp },
 *   state: myStateAdapter,
 * });
 *
 * bot.onNewMention(async (thread, message) => {
 *   await thread.post(`Hello, ${message.author.fullName}!`);
 * });
 *
 * await bot.initialize();
 * await whatsapp.connect();
 * ```
 */
export function createZaileysAdapter(options: CreateZaileysAdapterOptions = {}): ZaileysAdapter {
  const { client, session, ...rest } = options
  if (client != null && session != null) {
    throw new ValidationError('zaileys', 'Pass either `client` or `session`, not both')
  }
  const resolved = client ?? new Client(session ?? {})
  return new ZaileysAdapter({ ...rest, client: resolved })
}
