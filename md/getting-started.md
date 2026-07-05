# Getting Started

> Source: https://zeative.github.io/chat-adapter-zaileys/getting-started

# Getting Started

From an empty folder to a Chat SDK bot answering on WhatsApp.

### Install

```sh npm2yarn
npm i chat-adapter-zaileys zaileys chat @chat-adapter/state-memory
```

For durable message history, add the store backend you want (optional — memory is the zero-config default):

```sh npm2yarn
npm i better-sqlite3
```

### Create the bot

```typescript

const whatsapp = createZaileysAdapter({
  session: { sessionId: 'main' },
})

const bot = new Chat({
  userName: 'mybot',
  adapters: { whatsapp },
  state: createMemoryState(),
})

bot.onNewMention(async (thread, message) => {
  await thread.subscribe()
  await thread.post(`Hello, ${message.author.fullName}!`)
})

bot.onSubscribedMessage(async (thread, message) => {
  await thread.post(`You said: ${message.text}`)
})

await bot.initialize()
await whatsapp.connect()
```

Register all handlers **before** calling `whatsapp.connect()` — messages that arrive before initialization are lost.

### Authenticate

  
    On first run a QR code prints to the terminal. Scan it via **WhatsApp → Linked Devices → Link a device**. The session persists under `./.zaileys/auth/<sessionId>` and is reused on restart.
  
  
    Provide your number (E.164 digits, no `+`) and enter the 8-character code WhatsApp shows you:

    ```typescript
    const whatsapp = createZaileysAdapter({
      session: { sessionId: 'main', authType: 'pairing', phoneNumber: '6281234567890' },
    })
    ```
  

Reconnection with backoff, session reuse, and logout handling are all managed by Zaileys — there is nothing to wire.

## Bring your own Zaileys client

The `session` shorthand covers most cases, but you can construct the Zaileys `Client` yourself for full control — storage adapters, plugins, citation, ignore-self, anything from [Zaileys configuration](https://zeative.github.io/zaileys/configuration):

```typescript

const client = new Client({
  sessionId: 'main',
  auth: new SqliteAuthStore({ database: './auth.db' }),
  store: new SqliteMessageStore({ database: './wa.db' }), // durable history for fetchMessages
})

const whatsapp = createZaileysAdapter({ client })
```

Pass **either** `client` **or** `session` — never both. The factory throws a `ValidationError` if you do.

## Lifecycle

| Method | What it does |
| --- | --- |
| `adapter.connect()` | Opens the WhatsApp WebSocket (delegates to `client.connect()`) |
| `adapter.disconnect()` | Cleanly closes the connection; also called by `chat.shutdown()` |
| `adapter.handleWebhook()` | Always returns HTTP **501** — WhatsApp uses a persistent socket, not webhooks |

## Next steps

- [Configuration](/configuration) — every adapter option
- [Events & Handlers](/events) — what fires where
- [Cards & Buttons](/cards-buttons) — interactive messages
