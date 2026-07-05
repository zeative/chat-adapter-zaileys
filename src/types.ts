import type { Author, Logger } from 'chat'
import type { Client, MessageContext, PollVotePayload, WAMessage, WAMessageKey } from 'zaileys'

/** Decoded thread ID components for WhatsApp (zaileys). */
export interface ZaileysThreadId {
  /** WhatsApp JID, e.g. `"628123456789@s.whatsapp.net"` or `"123456789@g.us"`. */
  jid: string
}

/**
 * Raw payload attached to every Chat SDK `Message` produced by this adapter.
 *
 * - `key` — always present; the WhatsApp message key.
 * - `context` — the full zaileys `MessageContext` for live inbound messages
 *   (media helpers, reply/react, citation, flags). Absent for history/sent.
 * - `message` — the underlying Baileys `WAMessage` when available.
 */
export interface ZaileysRaw {
  key: WAMessageKey
  context?: MessageContext
  message?: WAMessage
}

/** Configuration for {@link ZaileysAdapter}. */
export interface ZaileysAdapterConfig {
  /**
   * The zaileys client to drive. Auth (QR / pairing code), reconnection and
   * session persistence are all handled by zaileys itself.
   */
  client: Client
  /**
   * Adapter identity used in thread ID prefixes (`name:encodedJid`).
   * Must not contain `:`. Set a unique value per account for multi-account
   * deployments. Defaults to `"zaileys"`.
   */
  adapterName?: string
  /** Bot display name (defaults to `"zaileys-bot"`). */
  userName?: string
  /** Logger instance. */
  logger?: Logger
  /**
   * Also forward decrypted poll votes to `chat.processMessage` with the
   * selected options as message text. Defaults to `true`.
   */
  forwardPollVotes?: boolean
  /** Mark chats as read automatically when a message arrives. Defaults to `false`. */
  autoMarkRead?: boolean
  /**
   * Render `{ markdown }` / `{ ast }` posts through zaileys AIRich — Meta-AI-style
   * rich bubbles with syntax-highlighted code, tables, and directives — instead
   * of plain WhatsApp markup. Defaults to `false`.
   */
  richMessages?: boolean
  /**
   * Route prefixed messages (`/cmd args`, using the zaileys client's command
   * prefixes) to `chat.onSlashCommand` instead of message handlers.
   * Defaults to `false`.
   */
  slashCommands?: boolean
}

/** A participant returned by {@link ZaileysAdapter.fetchGroupParticipants}. */
export interface ZaileysGroupParticipant {
  userId: string
  isAdmin: boolean
  isSuperAdmin: boolean
}

/** Named arguments for {@link ZaileysAdapter.sendLocation}. */
export interface ZaileysSendLocationArgs {
  threadId: string
  latitude: number
  longitude: number
  name?: string
  address?: string
}

/** Named arguments for {@link ZaileysAdapter.sendPoll}. */
export interface ZaileysSendPollArgs {
  threadId: string
  question: string
  options: string[]
  /** How many options a voter can select. Defaults to `1`. */
  selectableCount?: number
}

/**
 * Decrypted poll vote. zaileys decrypts votes natively (no manual
 * `messageSecret` bookkeeping) — this works for any poll the account sent.
 */
export interface ZaileysPollVote {
  threadId: string
  pollMessageId: string
  /** Poll question, when the original poll is still in the message store. */
  question: string | null
  /** Poll options, when the original poll is still in the message store. */
  options: string[]
  /** Option names currently selected (empty = vote cleared). */
  selectedOptions: string[]
  voter: Author
  raw: PollVotePayload
}

/** Handler signature for {@link ZaileysAdapter.onPollVote}. */
export type ZaileysPollVoteHandler = (vote: ZaileysPollVote) => void | Promise<void>
