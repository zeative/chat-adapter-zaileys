import {
  Message,
  defaultEmojiResolver,
  stringifyMarkdown,
  type Adapter,
  type AdapterPostableMessage,
  type Attachment,
  type Author,
  type ButtonElement,
  type CardElement,
  type ChannelInfo,
  type ChatInstance,
  type EmojiValue,
  type FetchOptions,
  type FetchResult,
  type FormattedContent,
  type ListThreadsOptions,
  type ListThreadsResult,
  type Logger,
  type RawMessage,
  type ScheduledMessage,
  type ThreadInfo,
  type UserInfo,
  type WebhookOptions,
} from 'chat'
import {
  ResourceNotFoundError,
  ValidationError,
  cardToFallbackText,
  extractCard,
  extractFiles,
  extractPostableAttachments,
} from '@chat-adapter/shared'
import {
  isJidGroup,
  isJidNewsletter,
  jidNormalizedUser,
  type ButtonDef,
  type Client,
  type MessageBuilder,
  type MessageContext,
  type SenderInfo,
  type WAMessage,
  type WAMessageKey,
} from 'zaileys'
import { ZaileysFormatConverter } from './format-converter.js'
import type {
  ZaileysAdapterConfig,
  ZaileysGroupParticipant,
  ZaileysPollVote,
  ZaileysPollVoteHandler,
  ZaileysRaw,
  ZaileysSendLocationArgs,
  ZaileysSendPollArgs,
  ZaileysThreadId,
} from './types.js'

const BUTTON_ID_LIMIT = 256
const BUTTON_DELIMITER = '\n'
const SENT_IDS_MAX = 1000

type PollVoteSubscription = { pollIds: string[] | null; handler: ZaileysPollVoteHandler }

const silentLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  child: () => silentLogger,
}

/**
 * WhatsApp adapter for Chat SDK, powered by zaileys.
 *
 * zaileys handles the entire connection lifecycle (QR / pairing-code auth,
 * reconnection, session persistence) and decodes every inbound message into a
 * rich `MessageContext` — exposed on `message.raw.context`.
 *
 * Compared to raw-Baileys adapters this one adds: real message history
 * (`fetchMessages` backed by the zaileys message store), Card → native
 * WhatsApp button rendering with `chat.onAction` round-trips, decrypted poll
 * votes without manual bookkeeping, native message scheduling, and rich media
 * out of the box.
 */
export class ZaileysAdapter implements Adapter<ZaileysThreadId, ZaileysRaw> {
  readonly name: string
  readonly userName: string
  readonly lockScope = 'channel' as const
  readonly persistThreadHistory = false

  private readonly _client: Client
  private readonly _config: ZaileysAdapterConfig
  private readonly _converter = new ZaileysFormatConverter()
  private _chat: ChatInstance | undefined
  private _logger: Logger
  private _wired = false
  private readonly _sentIds = new Set<string>()
  private readonly _pollVoteSubscriptions: PollVoteSubscription[] = []

  constructor(config: ZaileysAdapterConfig) {
    const name = config.adapterName ?? 'zaileys'
    if (name.includes(':')) {
      throw new ValidationError('zaileys', `adapterName must not contain ':' (got "${name}")`)
    }
    this.name = name
    this.userName = config.userName ?? 'zaileys-bot'
    this._config = config
    this._client = config.client
    this._logger = config.logger ?? silentLogger
  }

  /** The underlying zaileys client — full access to groups, privacy, newsletters, plugins, etc. */
  get client(): Client {
    return this._client
  }

  get botUserId(): string | undefined {
    const id = this._client.socket?.user?.id
    return typeof id === 'string' ? jidNormalizedUser(id) : undefined
  }

  async initialize(chat: ChatInstance): Promise<void> {
    this._chat = chat
    if (this._config.logger == null) this._logger = chat.getLogger(this.name)
    this.wireListeners()
  }

  /**
   * Connect to WhatsApp. Call after registering all handlers on your `Chat`
   * instance. QR/pairing prompts, session reuse and reconnection are handled
   * by zaileys.
   */
  async connect(): Promise<void> {
    await this._client.connect()
  }

  async disconnect(): Promise<void> {
    await this._client.disconnect()
  }

  // ---------------------------------------------------------------------------
  // Thread IDs
  // ---------------------------------------------------------------------------

  encodeThreadId(data: ZaileysThreadId): string {
    return `${this.name}:${Buffer.from(data.jid).toString('base64url')}`
  }

  decodeThreadId(threadId: string): ZaileysThreadId {
    const prefix = `${this.name}:`
    if (!threadId.startsWith(prefix)) {
      throw new ValidationError('zaileys', `Invalid thread ID: ${threadId}`)
    }
    return { jid: Buffer.from(threadId.slice(prefix.length), 'base64url').toString() }
  }

  channelIdFromThreadId(threadId: string): string {
    return threadId
  }

  isDM(threadId: string): boolean {
    const { jid } = this.decodeThreadId(threadId)
    return !isJidGroup(jid) && !isJidNewsletter(jid)
  }

  // ---------------------------------------------------------------------------
  // Webhook (not applicable — zaileys uses a persistent WebSocket)
  // ---------------------------------------------------------------------------

  async handleWebhook(_request: Request, _options?: WebhookOptions): Promise<Response> {
    return new Response(
      JSON.stringify({
        error:
          'The zaileys adapter does not use HTTP webhooks. Call adapter.connect() to start the WhatsApp connection.',
      }),
      { status: 501, headers: { 'Content-Type': 'application/json' } },
    )
  }

  // ---------------------------------------------------------------------------
  // Inbound wiring
  // ---------------------------------------------------------------------------

  private wireListeners(): void {
    if (this._wired) return
    this._wired = true
    const client = this._client

    client.on('message', (ctx: MessageContext) => {
      const chat = this._chat
      if (!chat || ctx.isStory || ctx.isNewsletter) return
      const jid = ctx.roomId ?? ctx.senderId
      const threadId = this.encodeThreadId({ jid })
      if (this._config.autoMarkRead === true && !ctx.isFromMe) {
        void this._client.chat.markRead(jid).catch(() => {})
      }
      if (this._config.slashCommands === true && ctx.isPrefix && !ctx.isFromMe) {
        const body = ctx.text.trim()
        const spaceIdx = body.indexOf(' ')
        const commandWord = (spaceIdx === -1 ? body : body.slice(0, spaceIdx)).slice(1)
        chat.processSlashCommand(
          {
            adapter: this,
            channelId: threadId,
            command: `/${commandWord}`,
            text: spaceIdx === -1 ? '' : body.slice(spaceIdx + 1).trim(),
            raw: ctx,
            user: {
              userId: ctx.senderId,
              userName: ctx.senderId.split('@')[0] ?? ctx.senderId,
              fullName: ctx.senderName ?? '',
              isBot: ctx.isBot,
              isMe: false,
            },
          },
          undefined,
        )
        return
      }
      void chat.processMessage(this, threadId, () =>
        Promise.resolve(this.parseMessage({ key: this.keyOf(ctx), context: ctx, message: ctx.message() })),
      )
    })

    client.on('reaction', (payload) => {
      const chat = this._chat
      if (!chat) return
      const jid = payload.key.remoteJid
      if (typeof jid !== 'string' || jid.length === 0) return
      const threadId = this.encodeThreadId({ jid: jidNormalizedUser(jid) })
      void chat.processReaction(
        {
          added: payload.emoji != null,
          emoji: defaultEmojiResolver.fromGChat(payload.emoji ?? ''),
          messageId: payload.key.id ?? '',
          raw: payload,
          rawEmoji: payload.emoji ?? '',
          threadId,
          user: this.authorOf(payload.sender),
        },
        undefined,
      )
    })

    client.on('button-click', (payload) => {
      const chat = this._chat
      if (!chat) return
      const jid = payload.key.remoteJid
      if (typeof jid !== 'string' || jid.length === 0) return
      const [actionId, value] = this.decodeButtonId(payload.buttonId)
      void chat.processAction(
        {
          actionId,
          adapter: this,
          messageId: payload.key.id ?? '',
          raw: payload,
          threadId: this.encodeThreadId({ jid: jidNormalizedUser(jid) }),
          user: this.authorOf(payload.sender),
          ...(value !== undefined ? { value } : {}),
        },
        undefined,
      )
    })

    client.on('list-select', (payload) => {
      const chat = this._chat
      if (!chat) return
      const jid = payload.key.remoteJid
      if (typeof jid !== 'string' || jid.length === 0) return
      const [actionId, value] = this.decodeButtonId(payload.rowId)
      void chat.processAction(
        {
          actionId,
          adapter: this,
          messageId: payload.key.id ?? '',
          raw: payload,
          threadId: this.encodeThreadId({ jid: jidNormalizedUser(jid) }),
          user: this.authorOf(payload.sender),
          ...(value !== undefined ? { value } : {}),
        },
        undefined,
      )
    })

    client.on('poll-vote', (payload) => {
      void this.dispatchPollVote(payload).catch((err) => this._logger.warn(`poll-vote dispatch failed: ${String(err)}`))
    })

    client.on('group-join', (payload) => {
      const chat = this._chat
      if (!chat) return
      const channelId = this.encodeThreadId({ jid: payload.groupId })
      for (const participant of payload.participants) {
        chat.processMemberJoinedChannel(
          {
            adapter: this,
            channelId,
            userId: participant.authorPn ?? participant.jid,
            ...(payload.by !== undefined ? { inviterId: payload.by } : {}),
          },
          undefined,
        )
      }
    })
  }

  private decodeButtonId(encoded: string): [string, string | undefined] {
    const idx = encoded.indexOf(BUTTON_DELIMITER)
    if (idx === -1) return [encoded, undefined]
    return [encoded.slice(0, idx), encoded.slice(idx + 1)]
  }

  private async dispatchPollVote(payload: {
    pollKey: WAMessageKey
    selectedOptions: string[]
    voter: SenderInfo
  }): Promise<void> {
    const chat = this._chat
    const jid = payload.pollKey.remoteJid
    if (!chat || typeof jid !== 'string' || jid.length === 0) return
    const threadId = this.encodeThreadId({ jid: jidNormalizedUser(jid) })
    const pollMessageId = payload.pollKey.id ?? ''
    const poll = await this.lookupPoll(payload.pollKey)
    const vote: ZaileysPollVote = {
      threadId,
      pollMessageId,
      question: poll?.question ?? null,
      options: poll?.options ?? [],
      selectedOptions: payload.selectedOptions,
      voter: this.authorOf(payload.voter),
      raw: payload as ZaileysPollVote['raw'],
    }
    for (const sub of this._pollVoteSubscriptions) {
      if (sub.pollIds !== null && !sub.pollIds.includes(pollMessageId)) continue
      await sub.handler(vote)
    }
    if (this._config.forwardPollVotes !== false && payload.selectedOptions.length > 0) {
      const text = payload.selectedOptions.join(', ')
      const author = this.authorOf(payload.voter)
      void chat.processMessage(this, threadId, () =>
        Promise.resolve(
          new Message<ZaileysRaw>({
            id: `pollvote-${pollMessageId}-${Date.now()}`,
            threadId,
            text,
            formatted: this._converter.toAst(text),
            raw: { key: payload.pollKey },
            author,
            metadata: { dateSent: new Date(), edited: false },
            attachments: [],
          }),
        ),
      )
    }
  }

  private async lookupPoll(pollKey: WAMessageKey): Promise<{ question: string; options: string[] } | null> {
    try {
      const stored = await this._client.store.getMessage(pollKey)
      const m = stored?.message as Record<string, unknown> | undefined
      if (!m) return null
      for (const field of ['pollCreationMessage', 'pollCreationMessageV2', 'pollCreationMessageV3']) {
        const poll = m[field] as { name?: string; options?: Array<{ optionName?: string }> } | undefined
        if (poll?.name != null) {
          return {
            question: poll.name,
            options: (poll.options ?? []).map((o) => o.optionName ?? '').filter((o) => o.length > 0),
          }
        }
      }
      return null
    } catch {
      return null
    }
  }

  // ---------------------------------------------------------------------------
  // Message parsing
  // ---------------------------------------------------------------------------

  parseMessage(raw: ZaileysRaw): Message<ZaileysRaw> {
    if (raw.context) return this.parseFromContext(raw)
    return this.parseFromWAMessage(raw)
  }

  private parseFromContext(raw: ZaileysRaw): Message<ZaileysRaw> {
    const ctx = raw.context as MessageContext
    const jid = ctx.roomId ?? ctx.senderId
    const threadId = this.encodeThreadId({ jid })
    const isMe = ctx.isFromMe || this._sentIds.has(ctx.chatId)
    const message = new Message<ZaileysRaw>({
      id: ctx.chatId,
      threadId,
      text: ctx.text,
      formatted: this._converter.toAst(ctx.text),
      raw,
      author: {
        userId: ctx.senderId,
        userName: ctx.senderId.split('@')[0] ?? ctx.senderId,
        fullName: ctx.senderName ?? '',
        isBot: isMe ? true : ctx.isBot,
        isMe,
      },
      metadata: { dateSent: new Date(ctx.timestamp), edited: ctx.isEdited },
      attachments: this.attachmentsOf(ctx),
    })
    if (ctx.isTagMe) message.isMention = true
    return message
  }

  private parseFromWAMessage(raw: ZaileysRaw): Message<ZaileysRaw> {
    const wa = raw.message
    const key = raw.key
    const jid = jidNormalizedUser(key.remoteJid ?? '')
    const threadId = this.encodeThreadId({ jid })
    const content = (wa?.message ?? {}) as Record<string, { caption?: string | null; text?: string | null } | string | null | undefined>
    const conversation = content['conversation']
    const extended = content['extendedTextMessage']
    let text = ''
    if (typeof conversation === 'string') text = conversation
    else if (extended != null && typeof extended === 'object' && typeof extended.text === 'string') text = extended.text
    else text = this.captionOf(content) ?? ''
    const fromMe = key.fromMe === true
    const senderId = fromMe
      ? (this.botUserId ?? jid)
      : jidNormalizedUser((typeof key.participant === 'string' && key.participant.length > 0 ? key.participant : key.remoteJid) ?? '')
    const pushName = typeof wa?.pushName === 'string' ? wa.pushName : ''
    return new Message<ZaileysRaw>({
      id: key.id ?? '',
      threadId,
      text,
      formatted: this._converter.toAst(text),
      raw,
      author: {
        userId: senderId,
        userName: senderId.split('@')[0] ?? senderId,
        fullName: pushName,
        isBot: fromMe ? true : 'unknown',
        isMe: fromMe || this._sentIds.has(key.id ?? ''),
      },
      metadata: {
        dateSent: new Date(Number(wa?.messageTimestamp ?? 0) * 1000),
        edited: wa?.message?.editedMessage != null,
      },
      attachments: [],
    })
  }

  private captionOf(
    content: Record<string, { caption?: string | null } | string | null | undefined>,
  ): string | null {
    for (const field of ['imageMessage', 'videoMessage', 'documentMessage']) {
      const node = content[field]
      if (node != null && typeof node === 'object' && typeof node.caption === 'string') return node.caption
    }
    return null
  }

  private attachmentsOf(ctx: MessageContext): Attachment[] {
    const media = ctx.media
    if (!media || !('buffer' in media) || typeof media.buffer !== 'function') return []
    const kind = media.type === 'sticker' ? 'image' : media.type === 'document' ? 'file' : media.type
    if (kind !== 'image' && kind !== 'file' && kind !== 'video' && kind !== 'audio') return []
    const attachment: Attachment = {
      type: kind,
      fetchData: () => media.buffer(),
      fetchMetadata: { messageId: ctx.chatId, jid: ctx.roomId ?? ctx.senderId },
    }
    if (media.mimetype != null) attachment.mimeType = media.mimetype
    if (media.fileName != null) attachment.name = media.fileName
    if (media.fileSize != null) attachment.size = media.fileSize
    return [attachment]
  }

  private authorOf(sender: SenderInfo): Author {
    const userId = sender.pn ?? sender.jid
    return {
      userId,
      userName: userId.split('@')[0] ?? userId,
      fullName: sender.pushName ?? '',
      isBot: 'unknown',
      isMe: sender.isMe === true,
    }
  }

  private keyOf(ctx: MessageContext): WAMessageKey {
    const key = ctx.message().key
    return key ?? { remoteJid: ctx.roomId ?? ctx.senderId, id: ctx.chatId, fromMe: ctx.isFromMe }
  }

  // ---------------------------------------------------------------------------
  // Sending
  // ---------------------------------------------------------------------------

  async postMessage(threadId: string, message: AdapterPostableMessage): Promise<RawMessage<ZaileysRaw>> {
    const { jid } = this.decodeThreadId(threadId)
    return this.sendPostable(jid, threadId, message)
  }

  private async sendPostable(
    jid: string,
    threadId: string,
    message: AdapterPostableMessage,
    quoted?: WAMessageKey,
  ): Promise<RawMessage<ZaileysRaw>> {
    const card = extractCard(message)
    if (card) return this.sendCard(jid, threadId, card, message, quoted)

    const files = extractFiles(message)
    const attachments = extractPostableAttachments(message)
    const text = this._converter.renderPostable(message)

    if (files.length === 0 && attachments.length === 0) {
      const markdown = this._config.richMessages === true ? this.markdownOf(message) : null
      const key = await this.sendBuilt(
        jid,
        (b) => (markdown !== null ? b.text(markdown, { rich: true }) : b.text(text)),
        quoted,
      )
      return this.toRaw(key, threadId)
    }

    let first: WAMessageKey | undefined
    let caption: string | undefined = text.length > 0 ? text : undefined
    for (const file of files) {
      const data = await this.fileToBuffer(file.data)
      const key = await this.sendMedia(jid, data, file.mimeType, file.filename, caption, quoted && first === undefined ? quoted : undefined)
      caption = undefined
      first ??= key
    }
    for (const attachment of attachments) {
      const data = attachment.data != null ? await this.fileToBuffer(attachment.data) : attachment.fetchData != null ? await attachment.fetchData() : null
      const src = data ?? attachment.url
      if (src == null) continue
      const key = await this.sendMedia(jid, src, attachment.mimeType, attachment.name, caption, quoted && first === undefined ? quoted : undefined)
      caption = undefined
      first ??= key
    }
    if (first === undefined) {
      const key = await this.sendBuilt(jid, (b) => b.text(text), quoted)
      return this.toRaw(key, threadId)
    }
    return this.toRaw(first, threadId)
  }

  private async sendCard(
    jid: string,
    threadId: string,
    card: CardElement,
    message: AdapterPostableMessage,
    quoted?: WAMessageKey,
  ): Promise<RawMessage<ZaileysRaw>> {
    const buttons = this.collectCardButtons(card)
    const fallback =
      (typeof message === 'object' && 'fallbackText' in message && typeof message.fallbackText === 'string'
        ? message.fallbackText
        : undefined) ?? cardToFallbackText(card, { boldFormat: '*' })
    if (buttons.length === 0) {
      const key = await this.sendBuilt(jid, (b) => b.text(fallback), quoted)
      return this.toRaw(key, threadId)
    }
    const key = await this.sendBuilt(
      jid,
      (b) =>
        b.buttons(buttons, {
          text: fallback,
          ...(card.title != null ? { title: card.title } : {}),
          ...(card.subtitle != null ? { footer: card.subtitle } : {}),
          ...(card.imageUrl != null ? { image: card.imageUrl } : {}),
        }),
      quoted,
    )
    return this.toRaw(key, threadId)
  }

  private collectCardButtons(card: CardElement): ButtonDef[] {
    const defs: ButtonDef[] = []
    const walk = (children: unknown[]): void => {
      for (const child of children) {
        if (child == null || typeof child !== 'object') continue
        const node = child as { type?: string; children?: unknown[] }
        if (node.type === 'actions' && Array.isArray(node.children)) {
          for (const el of node.children) {
            const button = el as ButtonElement & { type?: string }
            if (button?.type !== 'button' || typeof button.id !== 'string') continue
            const value = (button as { value?: string }).value
            const id = value !== undefined ? `${button.id}${BUTTON_DELIMITER}${value}` : button.id
            if (id.length > BUTTON_ID_LIMIT) {
              throw new ValidationError(
                'zaileys',
                `Encoded button id exceeds ${BUTTON_ID_LIMIT} chars (actionId "${button.id}")`,
              )
            }
            defs.push({ id, text: button.label })
          }
        } else if (Array.isArray(node.children)) {
          walk(node.children)
        }
      }
    }
    walk(card.children)
    return defs
  }

  private async sendMedia(
    jid: string,
    src: Buffer | string,
    mimeType: string | undefined,
    fileName: string | undefined,
    caption: string | undefined,
    quoted?: WAMessageKey,
  ): Promise<WAMessageKey> {
    const mime = mimeType ?? ''
    return this.sendBuilt(
      jid,
      (b) => {
        if (mime.startsWith('image/')) return b.image(src, caption !== undefined ? { caption } : {})
        if (mime.startsWith('video/')) return b.video(src, caption !== undefined ? { caption } : {})
        if (mime.startsWith('audio/')) return b.audio(src)
        return b.document(src, {
          fileName: fileName ?? 'file',
          ...(mime.length > 0 ? { mimetype: mime } : {}),
          ...(caption !== undefined ? { caption } : {}),
        })
      },
      quoted,
    )
  }

  private async sendBuilt(
    jid: string,
    build: (b: MessageBuilder<'init'>) => MessageBuilder<'content-set'>,
    quoted?: WAMessageKey,
  ): Promise<WAMessageKey> {
    let builder = build(this._client.send(jid))
    if (quoted !== undefined) builder = builder.reply(quoted)
    const key = await builder
    this.trackSent(key)
    return key
  }

  private async fileToBuffer(data: Buffer | Blob | ArrayBuffer | unknown): Promise<Buffer> {
    if (Buffer.isBuffer(data)) return data
    if (data instanceof ArrayBuffer) return Buffer.from(data)
    if (typeof Blob !== 'undefined' && data instanceof Blob) return Buffer.from(await data.arrayBuffer())
    throw new ValidationError('zaileys', 'Unsupported file data type — expected Buffer, ArrayBuffer, or Blob')
  }

  private markdownOf(message: AdapterPostableMessage): string | null {
    if (typeof message === 'string') return null
    if ('markdown' in message && typeof message.markdown === 'string') return message.markdown
    if ('ast' in message && message.ast != null) return stringifyMarkdown(message.ast)
    return null
  }

  private trackSent(key: WAMessageKey): void {
    if (typeof key.id !== 'string' || key.id.length === 0) return
    this._sentIds.add(key.id)
    if (this._sentIds.size > SENT_IDS_MAX) {
      const oldest = this._sentIds.values().next().value
      if (oldest !== undefined) this._sentIds.delete(oldest)
    }
  }

  private toRaw(key: WAMessageKey, threadId: string): RawMessage<ZaileysRaw> {
    return { id: key.id ?? '', raw: { key }, threadId }
  }

  private messageKey(threadId: string, messageId: string, fromMe = true): WAMessageKey {
    const { jid } = this.decodeThreadId(threadId)
    return { remoteJid: jid, id: messageId, fromMe }
  }

  // ---------------------------------------------------------------------------
  // Edit / delete / reactions
  // ---------------------------------------------------------------------------

  async editMessage(
    threadId: string,
    messageId: string,
    message: AdapterPostableMessage,
  ): Promise<RawMessage<ZaileysRaw>> {
    const key = this.messageKey(threadId, messageId)
    const text = this._converter.renderPostable(message)
    await this._client.edit(key).text(text)
    return this.toRaw(key, threadId)
  }

  async deleteMessage(threadId: string, messageId: string): Promise<void> {
    await this._client.delete(this.messageKey(threadId, messageId))
  }

  async addReaction(
    threadId: string,
    messageId: string,
    emoji: EmojiValue | string,
    participant?: string,
  ): Promise<void> {
    const key = this.reactionKey(threadId, messageId, participant)
    await this._client.react(key, defaultEmojiResolver.toGChat(emoji))
  }

  async removeReaction(
    threadId: string,
    messageId: string,
    _emoji: EmojiValue | string,
    participant?: string,
  ): Promise<void> {
    const key = this.reactionKey(threadId, messageId, participant)
    await this._client.react(key, '')
  }

  private reactionKey(threadId: string, messageId: string, participant?: string): WAMessageKey {
    const fromMe = this._sentIds.has(messageId)
    const key = this.messageKey(threadId, messageId, fromMe)
    if (participant !== undefined) key.participant = participant
    return key
  }

  // ---------------------------------------------------------------------------
  // History — REAL, backed by the zaileys message store
  // ---------------------------------------------------------------------------

  async fetchMessages(threadId: string, options?: FetchOptions): Promise<FetchResult<ZaileysRaw>> {
    if (options?.direction === 'forward') {
      throw new ValidationError('zaileys', 'forward pagination is not supported — use direction: "backward"')
    }
    const { jid } = this.decodeThreadId(threadId)
    const limit = options?.limit ?? 50
    const before = options?.cursor !== undefined ? Number(options.cursor) : undefined
    const page = await this._client.store.listMessages(jid, {
      limit,
      ...(before !== undefined && Number.isFinite(before) ? { before } : {}),
    })
    const chronological = [...page].sort(
      (a, b) => Number(a.messageTimestamp ?? 0) - Number(b.messageTimestamp ?? 0),
    )
    const messages = chronological
      .filter((m): m is WAMessage & { key: WAMessageKey } => m.key != null)
      .map((m) => this.parseMessage({ key: m.key, message: m }))
    const oldest = chronological[0]
    const result: FetchResult<ZaileysRaw> = { messages }
    if (page.length === limit && oldest?.messageTimestamp != null) {
      result.nextCursor = String(Number(oldest.messageTimestamp))
    }
    return result
  }

  async fetchMessage(threadId: string, messageId: string): Promise<Message<ZaileysRaw> | null> {
    for (const fromMe of [false, true]) {
      const stored = await this._client.store.getMessage(this.messageKey(threadId, messageId, fromMe))
      if (stored?.key != null) return this.parseMessage({ key: stored.key, message: stored })
    }
    return null
  }

  async fetchChannelMessages(channelId: string, options?: FetchOptions): Promise<FetchResult<ZaileysRaw>> {
    return this.fetchMessages(channelId, options)
  }

  // ---------------------------------------------------------------------------
  // Thread / channel / user metadata
  // ---------------------------------------------------------------------------

  async fetchThread(threadId: string): Promise<ThreadInfo> {
    const { jid } = this.decodeThreadId(threadId)
    const isDM = this.isDM(threadId)
    let channelName: string | undefined
    const metadata: Record<string, unknown> = { jid }
    if (isJidGroup(jid)) {
      try {
        const group = await this._client.group.metadata(jid)
        channelName = group.subject
        metadata['participantCount'] = group.participants.length
        if (group.desc != null) metadata['description'] = group.desc
      } catch {
        // group metadata unavailable (e.g. no longer a member) — jid-only info
      }
    } else {
      const contact = await this._client.store.getContact(jid).catch(() => undefined)
      channelName = contact?.name ?? contact?.notify ?? undefined
    }
    return {
      id: threadId,
      channelId: threadId,
      ...(channelName !== undefined ? { channelName } : {}),
      isDM,
      metadata,
    }
  }

  async fetchChannelInfo(channelId: string): Promise<ChannelInfo> {
    const info = await this.fetchThread(channelId)
    return {
      id: channelId,
      ...(info.channelName !== undefined ? { name: info.channelName } : {}),
    } as ChannelInfo
  }

  async listThreads(_channelId: string, _options?: ListThreadsOptions): Promise<ListThreadsResult<ZaileysRaw>> {
    return { threads: [] }
  }

  async postChannelMessage(channelId: string, message: AdapterPostableMessage): Promise<RawMessage<ZaileysRaw>> {
    return this.postMessage(channelId, message)
  }

  async openDM(userId: string): Promise<string> {
    const jid = userId.includes('@') ? jidNormalizedUser(userId) : `${userId.replace(/\D/g, '')}@s.whatsapp.net`
    return this.encodeThreadId({ jid })
  }

  async getUser(userId: string): Promise<UserInfo | null> {
    const jid = userId.includes('@') ? jidNormalizedUser(userId) : `${userId.replace(/\D/g, '')}@s.whatsapp.net`
    const contact = await this._client.store.getContact(jid).catch(() => undefined)
    const avatarUrl = await this._client.profile.getPicture(jid).catch(() => null)
    if (contact == null && avatarUrl == null) return null
    const fullName = contact?.name ?? contact?.notify ?? ''
    return {
      userId: jid,
      userName: jid.split('@')[0] ?? jid,
      fullName,
      isBot: false,
      ...(avatarUrl != null ? { avatarUrl } : {}),
    }
  }

  getChannelVisibility(_threadId: string): 'private' | 'workspace' | 'external' | 'unknown' {
    return 'private'
  }

  rehydrateAttachment(attachment: Attachment): Attachment {
    const meta = attachment.fetchMetadata
    if (meta?.['messageId'] == null || meta['jid'] == null) return attachment
    const key: WAMessageKey = { remoteJid: meta['jid'], id: meta['messageId'], fromMe: false }
    return {
      ...attachment,
      fetchData: async () => {
        const result = await this._client.downloadMedia(key)
        if (result == null) {
          throw new ResourceNotFoundError('zaileys', 'media', meta['messageId'])
        }
        return result.buffer
      },
    }
  }

  async startTyping(threadId: string, _status?: string): Promise<void> {
    const { jid } = this.decodeThreadId(threadId)
    await this._client.presence.typing(jid)
  }

  renderFormatted(content: FormattedContent): string {
    return this._converter.fromAst(content)
  }

  // ---------------------------------------------------------------------------
  // Scheduling — native, persisted through the zaileys scheduler
  // ---------------------------------------------------------------------------

  async scheduleMessage(
    threadId: string,
    message: AdapterPostableMessage,
    options: { postAt: Date },
  ): Promise<ScheduledMessage<ZaileysRaw>> {
    const { jid } = this.decodeThreadId(threadId)
    const text = this._converter.renderPostable(message)
    const handle = await this._client.scheduleAt(options.postAt, (b) => b.to(jid).text(text))
    return {
      cancel: async () => handle.cancel(),
      channelId: threadId,
      postAt: options.postAt,
      raw: { key: { remoteJid: jid, id: handle.id } },
      scheduledMessageId: handle.id,
    }
  }

  // ---------------------------------------------------------------------------
  // WhatsApp-native extensions
  // ---------------------------------------------------------------------------

  /**
   * The full zaileys message builder, pre-targeted at a thread — the escape
   * hatch to EVERYTHING WhatsApp supports: `viewOnce` media, voice notes,
   * albums, carousels, lists, templates, events, products, group invites,
   * mentions, disappearing messages, …
   *
   * ```typescript
   * await wa.native(thread.id).image(buffer, { viewOnce: true })
   * await wa.native(thread.id).text("hi @all").mentionAll()
   * ```
   *
   * Note: messages sent this way are not tracked for `author.isMe` echo detection.
   */
  native(threadId: string): MessageBuilder<'init'> {
    const { jid } = this.decodeThreadId(threadId)
    return this._client.send(jid)
  }

  /** Send a quoted reply — WhatsApp's native reply bubble. */
  async reply(
    message: Message<ZaileysRaw> | Message<unknown>,
    content: AdapterPostableMessage,
  ): Promise<RawMessage<ZaileysRaw>> {
    const raw = message.raw as ZaileysRaw | undefined
    const key = raw?.key ?? { remoteJid: this.decodeThreadId(message.threadId).jid, id: message.id, fromMe: false }
    const { jid } = this.decodeThreadId(message.threadId)
    return this.sendPostable(jid, message.threadId, content, key)
  }

  /** Mark the chat as read (blue ticks). */
  async markRead(threadId: string): Promise<void> {
    const { jid } = this.decodeThreadId(threadId)
    await this._client.chat.markRead(jid)
  }

  /** Set the bot's global presence. */
  async setPresence(presence: 'available' | 'unavailable'): Promise<void> {
    if (presence === 'available') await this._client.presence.online()
    else await this._client.presence.offline()
  }

  /** Send a native location pin. */
  async sendLocation(args: ZaileysSendLocationArgs): Promise<RawMessage<ZaileysRaw>> {
    const { jid } = this.decodeThreadId(args.threadId)
    const key = await this.sendBuilt(jid, (b) =>
      b.location(args.latitude, args.longitude, {
        ...(args.name !== undefined ? { name: args.name } : {}),
        ...(args.address !== undefined ? { address: args.address } : {}),
      }),
    )
    return this.toRaw(key, args.threadId)
  }

  /** Send a native WhatsApp poll. Votes arrive via {@link onPollVote} — decryption is automatic. */
  async sendPoll(args: ZaileysSendPollArgs): Promise<RawMessage<ZaileysRaw>> {
    const { jid } = this.decodeThreadId(args.threadId)
    const multipleChoice = args.selectableCount !== undefined && args.selectableCount !== 1
    const key = await this.sendBuilt(jid, (b) =>
      b.poll(args.question, args.options, multipleChoice ? { multipleChoice } : {}),
    )
    return this.toRaw(key, args.threadId)
  }

  /** Send a sticker (webp/png/jpeg — zaileys converts, including animated Lottie). */
  async sendSticker(threadId: string, src: Buffer | string): Promise<RawMessage<ZaileysRaw>> {
    const { jid } = this.decodeThreadId(threadId)
    const key = await this.sendBuilt(jid, (b) => b.sticker(src))
    return this.toRaw(key, threadId)
  }

  /** Send a voice note (push-to-talk audio bubble). */
  async sendVoiceNote(threadId: string, src: Buffer | string): Promise<RawMessage<ZaileysRaw>> {
    const { jid } = this.decodeThreadId(threadId)
    const key = await this.sendBuilt(jid, (b) => b.audio(src, { ptt: true }))
    return this.toRaw(key, threadId)
  }

  /** Send a contact card (vCard). */
  async sendContact(threadId: string, vcard: string): Promise<RawMessage<ZaileysRaw>> {
    const { jid } = this.decodeThreadId(threadId)
    const key = await this.sendBuilt(jid, (b) => b.contact(vcard))
    return this.toRaw(key, threadId)
  }

  /** Show the "recording audio…" indicator. */
  async startRecording(threadId: string): Promise<void> {
    const { jid } = this.decodeThreadId(threadId)
    await this._client.presence.recording(jid)
  }

  /** Toggle disappearing messages for a chat (`0` disables). */
  async setDisappearing(threadId: string, seconds: number): Promise<void> {
    const { jid } = this.decodeThreadId(threadId)
    await this._client.setDisappearing(jid, seconds)
  }

  /** Forward a message to another thread. */
  async forwardMessage(threadId: string, messageId: string, toThreadId: string): Promise<RawMessage<ZaileysRaw>> {
    const { jid: toJid } = this.decodeThreadId(toThreadId)
    const key = await this._client.forward(this.messageKey(threadId, messageId, this._sentIds.has(messageId)), toJid)
    this.trackSent(key)
    return this.toRaw(key, toThreadId)
  }

  /** Pin a message in a chat. */
  async pinMessage(threadId: string, messageId: string): Promise<void> {
    await this._client.pin(this.messageKey(threadId, messageId, this._sentIds.has(messageId)))
  }

  /** Unpin a message in a chat. */
  async unpinMessage(threadId: string, messageId: string): Promise<void> {
    await this._client.unpin(this.messageKey(threadId, messageId, this._sentIds.has(messageId)))
  }

  /** Fetch group participants with admin flags. Throws for non-group threads. */
  async fetchGroupParticipants(threadId: string): Promise<ZaileysGroupParticipant[]> {
    const { jid } = this.decodeThreadId(threadId)
    if (!isJidGroup(jid)) {
      throw new ResourceNotFoundError('zaileys', 'group', jid)
    }
    const metadata = await this._client.group.metadata(jid)
    return metadata.participants.map((p) => ({
      userId: p.id,
      isAdmin: p.admin === 'admin' || p.admin === 'superadmin',
      isSuperAdmin: p.admin === 'superadmin',
    }))
  }

  /**
   * Subscribe to decrypted poll votes. Unlike raw-Baileys adapters there is no
   * manual `messageSecret` persistence — zaileys decrypts votes natively, and
   * it works across restarts for any poll this account sent.
   */
  onPollVote(handler: ZaileysPollVoteHandler): void
  onPollVote(pollMessageIds: string | string[], handler: ZaileysPollVoteHandler): void
  onPollVote(
    first: ZaileysPollVoteHandler | string | string[],
    second?: ZaileysPollVoteHandler,
  ): void {
    if (typeof first === 'function') {
      this._pollVoteSubscriptions.push({ pollIds: null, handler: first })
      return
    }
    if (second === undefined) {
      throw new ValidationError('zaileys', 'onPollVote(pollIds, handler) requires a handler')
    }
    this._pollVoteSubscriptions.push({
      pollIds: Array.isArray(first) ? first : [first],
      handler: second,
    })
  }
}
