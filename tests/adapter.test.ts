import { describe, expect, it } from 'vitest'
import type { Client, MessageContext, WAMessage } from 'zaileys'
import { ZaileysAdapter, createZaileysAdapter, isZaileysAdapter, requireZaileysAdapter } from '../src/index.js'

const fakeClient = (overrides: Record<string, unknown> = {}): Client =>
  ({
    on: () => {},
    socket: undefined,
    store: {
      listMessages: async () => [],
      getMessage: async () => undefined,
      getContact: async () => undefined,
    },
    ...overrides,
  }) as unknown as Client

const adapter = (overrides: Record<string, unknown> = {}): ZaileysAdapter =>
  new ZaileysAdapter({ client: fakeClient(overrides) })

const fakeContext = (overrides: Partial<MessageContext> = {}): MessageContext =>
  ({
    chatId: 'MSG1',
    roomId: '628111@s.whatsapp.net',
    senderId: '628111@s.whatsapp.net',
    senderName: 'Tester',
    text: 'hello *world*',
    timestamp: 1_700_000_000_000,
    isFromMe: false,
    isBot: false,
    isEdited: false,
    isTagMe: false,
    isStory: false,
    isNewsletter: false,
    message: () => ({ key: { remoteJid: '628111@s.whatsapp.net', id: 'MSG1', fromMe: false } }),
    ...overrides,
  }) as unknown as MessageContext

describe('thread ids', () => {
  it('roundtrips jids', () => {
    const a = adapter()
    const id = a.encodeThreadId({ jid: '123456789@g.us' })
    expect(id.startsWith('zaileys:')).toBe(true)
    expect(a.decodeThreadId(id)).toEqual({ jid: '123456789@g.us' })
  })

  it('rejects foreign thread ids', () => {
    expect(() => adapter().decodeThreadId('slack:C123')).toThrow()
  })

  it('detects DMs vs groups', () => {
    const a = adapter()
    expect(a.isDM(a.encodeThreadId({ jid: '628111@s.whatsapp.net' }))).toBe(true)
    expect(a.isDM(a.encodeThreadId({ jid: '123@g.us' }))).toBe(false)
  })

  it('rejects adapterName with colon', () => {
    expect(() => new ZaileysAdapter({ client: fakeClient(), adapterName: 'a:b' })).toThrow()
  })
})

describe('parseMessage', () => {
  it('parses a rich zaileys context', () => {
    const a = adapter()
    const ctx = fakeContext()
    const msg = a.parseMessage({ key: { id: 'MSG1' }, context: ctx })
    expect(msg.id).toBe('MSG1')
    expect(msg.text).toBe('hello *world*')
    expect(msg.author.userId).toBe('628111@s.whatsapp.net')
    expect(msg.author.userName).toBe('628111')
    expect(msg.author.fullName).toBe('Tester')
    expect(msg.author.isMe).toBe(false)
    expect(msg.metadata.dateSent.getTime()).toBe(1_700_000_000_000)
    expect(msg.raw.context).toBe(ctx)
  })

  it('marks tag-me as mention', () => {
    const msg = adapter().parseMessage({ key: { id: 'M' }, context: fakeContext({ isTagMe: true }) })
    expect(msg.isMention).toBe(true)
  })

  it('parses a bare WAMessage (history path)', () => {
    const wa = {
      key: { remoteJid: '628222@s.whatsapp.net', id: 'H1', fromMe: false },
      pushName: 'Historian',
      messageTimestamp: 1_700_000_000,
      message: { conversation: 'old text' },
    } as unknown as WAMessage
    const msg = adapter().parseMessage({ key: wa.key, message: wa })
    expect(msg.text).toBe('old text')
    expect(msg.author.fullName).toBe('Historian')
    expect(msg.metadata.dateSent.getTime()).toBe(1_700_000_000_000)
  })

  it('extracts media captions on the lite path', () => {
    const wa = {
      key: { remoteJid: '628222@s.whatsapp.net', id: 'H2', fromMe: false },
      message: { imageMessage: { caption: 'pic caption' } },
    } as unknown as WAMessage
    expect(adapter().parseMessage({ key: wa.key, message: wa }).text).toBe('pic caption')
  })
})

describe('fetchMessages (store-backed history)', () => {
  const waMsg = (id: string, ts: number): WAMessage =>
    ({
      key: { remoteJid: '628111@s.whatsapp.net', id, fromMe: false },
      messageTimestamp: ts,
      message: { conversation: `msg ${id}` },
    }) as unknown as WAMessage

  it('returns chronological messages with a backward cursor', async () => {
    const calls: unknown[] = []
    const a = adapter({
      store: {
        listMessages: async (_jid: string, opts: unknown) => {
          calls.push(opts)
          return [waMsg('B', 200), waMsg('A', 100)]
        },
        getMessage: async () => undefined,
        getContact: async () => undefined,
      },
    })
    const threadId = a.encodeThreadId({ jid: '628111@s.whatsapp.net' })
    const result = await a.fetchMessages(threadId, { limit: 2 })
    expect(result.messages.map((m) => m.id)).toEqual(['A', 'B'])
    expect(result.nextCursor).toBe('100')
    expect(calls[0]).toEqual({ limit: 2 })

    await a.fetchMessages(threadId, { limit: 2, cursor: result.nextCursor as string })
    expect(calls[1]).toEqual({ limit: 2, before: 100 })
  })

  it('omits nextCursor when the page is short', async () => {
    const a = adapter({
      store: {
        listMessages: async () => [waMsg('A', 100)],
        getMessage: async () => undefined,
        getContact: async () => undefined,
      },
    })
    const result = await a.fetchMessages(a.encodeThreadId({ jid: '628111@s.whatsapp.net' }), { limit: 50 })
    expect(result.nextCursor).toBeUndefined()
  })

  it('rejects forward pagination', async () => {
    const a = adapter()
    await expect(
      a.fetchMessages(a.encodeThreadId({ jid: 'x@s.whatsapp.net' }), { direction: 'forward' }),
    ).rejects.toThrow()
  })
})

describe('guards + factory', () => {
  it('narrows adapters', () => {
    const a = adapter()
    expect(isZaileysAdapter(a)).toBe(true)
    expect(isZaileysAdapter({})).toBe(false)
    expect(requireZaileysAdapter({ adapter: a })).toBe(a)
    expect(() => requireZaileysAdapter({})).toThrow()
  })

  it('factory accepts an existing client', () => {
    const client = fakeClient()
    const a = createZaileysAdapter({ client, adapterName: 'wa-main' })
    expect(a.client).toBe(client)
    expect(a.name).toBe('wa-main')
  })

  it('factory rejects client + session together', () => {
    expect(() => createZaileysAdapter({ client: fakeClient(), session: {} })).toThrow()
  })
})
