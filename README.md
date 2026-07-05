<div align="center">

<br>

<img alt="chat-adapter-zaileys - WhatsApp adapter for Chat SDK powered by Zaileys" src="https://github.com/zeative/chat-adapter-zaileys/blob/main/public/icon.png?raw=true" width="140">

<br>
<br>

<h1 align="center">chat-adapter-zaileys — WhatsApp adapter <br /> for Chat SDK, powered by Zaileys</h1>

<br>

<div align="center">
  <a href="https://www.npmjs.com/package/chat-adapter-zaileys"><img src="https://img.shields.io/npm/v/chat-adapter-zaileys.svg" alt="NPM Version"></a>
  <a href="https://www.npmjs.com/package/chat-adapter-zaileys"><img src="https://img.shields.io/npm/dw/chat-adapter-zaileys?label=npm&color=%23CB3837" alt="NPM Downloads"></a>
  <a href="https://github.com/zeative/chat-adapter-zaileys/releases"><img src="https://img.shields.io/npm/dt/chat-adapter-zaileys" alt="NPM Total Downloads"></a>
  <a href="https://github.com/zeative/chat-adapter-zaileys"><img src="https://img.shields.io/badge/TypeScript-strict-blue?style=flat-square&logo=typescript" alt="TypeScript"></a>
</div>

<div align="center">
  <a href="https://github.com/zeative/chat-adapter-zaileys/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="License: MIT"></a>
  <a href="https://discord.gg/KBHhTTVUc5"><img alt="Discord" src="https://img.shields.io/discord/1105833273415962654?logo=discord&label=discord&link=https%3A%2F%2Fgithub.com%2Fzeative%2Fzaileys"></a>
  <a href="https://chat.whatsapp.com/GlQfvc83mSH3F6ov06vuCt"><img alt="WhatsApp" src="https://img.shields.io/badge/WhatsApp-Group-25D366?logo=whatsapp&logoColor=white"></a>
  <a href="https://github.com/zeative/chat-adapter-zaileys"><img src="https://img.shields.io/github/stars/zeative/chat-adapter-zaileys" alt="GitHub Stars"></a>
  <a href="https://github.com/zeative/chat-adapter-zaileys"><img src="https://img.shields.io/github/forks/zeative/chat-adapter-zaileys" alt="GitHub Forks"></a>
</div>

<br>

<div align="center">
  <p>
    <b>chat-adapter-zaileys</b> plugs WhatsApp into <a href="https://chat-sdk.dev">Chat SDK</a> through <a href="https://github.com/zeative/zaileys">Zaileys</a>. Auth (QR / pairing code), reconnection, session persistence, and message decoding are all handled by Zaileys — so the adapter stays thin, and your bot gets real message history, native buttons from Cards, decrypted poll votes, scheduling, and rich media that raw-Baileys adapters can't offer.
  </p>
</div>

<div align="center">

[Quick start](#quick-start) &nbsp;•&nbsp;
[Why this adapter](#why-this-adapter) &nbsp;•&nbsp;
[Install](#install) &nbsp;•&nbsp;
[What you can build](#what-you-can-build) &nbsp;•&nbsp;
[Configuration](#configuration) &nbsp;•&nbsp;
[Zaileys Docs](https://zeative.github.io/zaileys/)

</div>

</div>

<br>

> [!NOTE]
> This adapter wraps the full **Zaileys** client — everything in the [Zaileys documentation](https://zeative.github.io/zaileys/) (groups, communities, newsletters, privacy, broadcast, plugins) is reachable via `adapter.client`.

---

## Quick start

```typescript
import { Chat, memoryState } from 'chat'
import { createZaileysAdapter } from 'chat-adapter-zaileys'

const whatsapp = createZaileysAdapter({
  session: { sessionId: 'main' }, // QR prints to the terminal on first run
})

const bot = new Chat({
  userName: 'mybot',
  adapters: { whatsapp },
  state: memoryState(),
})

bot.onNewMention(async (thread, message) => {
  await thread.subscribe()
  await thread.post(`Hello, ${message.author.fullName}!`)
})

await bot.initialize()
await whatsapp.connect() // register handlers first, then connect
```

Scan the printed QR via **WhatsApp → Linked Devices**, done. Prefer a pairing code?

```typescript
const whatsapp = createZaileysAdapter({
  session: { sessionId: 'main', authType: 'pairing', phoneNumber: '6281234567890' },
})
```

## Why this adapter

| Capability | chat-adapter-zaileys | raw-Baileys adapters |
| --- | --- | --- |
| Message history (`thread.fetchMessages`) | ✅ **real**, backed by the Zaileys message store (memory/SQLite/Postgres/Redis/Convex) | ❌ empty arrays |
| Cards & buttons (`chat.onAction`) | ✅ rendered as **native WhatsApp buttons**, clicks round-trip to `onAction` | ❌ fallback text only |
| Poll votes | ✅ decrypted natively — works across restarts, zero bookkeeping | ⚠️ manual `messageSecret` persistence |
| Scheduled messages (`thread.schedule`) | ✅ native, persisted through the Zaileys scheduler | ❌ |
| Auth & reconnect | ✅ QR terminal / pairing code built in, auto-reconnect with backoff | ⚠️ wire `onQR`/reconnect yourself |
| Rich sends | ✅ image/video/audio/document/sticker (incl. animated Lottie), voice notes, locations, polls, albums | ⚠️ partial |
| Media in `queue`/`debounce` strategies | ✅ `rehydrateAttachment` re-downloads by message key | ❌ |
| Raw escape hatch | `message.raw.context` = full Zaileys `MessageContext` (media helpers, reply/react, citation) | plain `WAMessage` |

## Install

```bash
npm i chat-adapter-zaileys zaileys chat   # or: pnpm add  •  yarn add  •  bun add
```

Requires **Node.js v20+**. Peer dependencies are just `chat` and `zaileys` — no direct Baileys dependency.

For message history that survives restarts, give Zaileys a durable store (optional peer deps, install only what you use):

```bash
npm i better-sqlite3   # sqlite  •  redis (redis)  •  pg (postgres)  •  convex (convex)
```

## What you can build

### Bring your own Zaileys client

Full control — stores, plugins, citation, commands — then hand it to the adapter:

```typescript
import { Client, SqliteMessageStore } from 'zaileys'
import { createZaileysAdapter } from 'chat-adapter-zaileys'

const client = new Client({
  sessionId: 'main',
  store: new SqliteMessageStore({ database: './wa.db' }), // durable fetchMessages history
})
const whatsapp = createZaileysAdapter({ client })
```

### Cards → native WhatsApp buttons

```tsx
bot.onNewMention(async (thread) => {
  await thread.post(
    <Card title="Deploy?">
      <Actions>
        <Button id="deploy" value="prod">Ship it</Button>
        <Button id="cancel">Cancel</Button>
      </Actions>
    </Card>
  )
})

bot.onAction('deploy', async (event) => {
  await event.thread?.post(`Deploying ${event.value}…`)
})
```

### The zaileys payload, one call away

Every live message carries the full zaileys `MessageContext` — flags, lazy media, quoted decode, citation:

```typescript
import { zaileysContext } from 'chat-adapter-zaileys'

bot.onSubscribedMessage(async (thread, message) => {
  const ctx = zaileysContext(message)
  if (!ctx) return

  ctx.isGroup / ctx.isForwarded / ctx.isViewOnce / ctx.isEphemeral // 20+ flags
  ctx.senderDevice                        // 'android' | 'ios' | 'web' | …
  const media = ctx.media                 // lazy — nothing downloads until you ask
  const quoted = await ctx.replied()      // full decoded quoted message
  await ctx.react('🔥')                   // zaileys shortcuts still work
})
```

### WhatsApp-native extensions

Narrow any `Thread`/`Channel` with `requireZaileysAdapter` and go beyond the Chat SDK surface:

```typescript
import { requireZaileysAdapter } from 'chat-adapter-zaileys'

bot.onSubscribedMessage(async (thread, message) => {
  const wa = requireZaileysAdapter(thread)

  await wa.markRead(thread.id)                     // blue ticks
  await wa.reply(message, 'Got it!')               // native quoted reply
  await wa.sendLocation({ threadId: thread.id, latitude: -6.2, longitude: 106.8 })
  await wa.sendSticker(thread.id, stickerBuffer)   // auto webp conversion, Lottie included
  await wa.sendVoiceNote(thread.id, oggBuffer)     // push-to-talk bubble
  await wa.sendContact(thread.id, vcardString)
  await wa.startRecording(thread.id)               // "recording audio…" indicator
  await wa.forwardMessage(thread.id, message.id, otherThreadId)
  await wa.pinMessage(thread.id, message.id)
  await wa.setPresence('available')
  await wa.setDisappearing(thread.id, 86_400)      // disappearing messages (0 disables)

  const participants = await wa.fetchGroupParticipants(thread.id)
  const admins = participants.filter((p) => p.isAdmin)
})
```

### Polls — zero bookkeeping

```typescript
const poll = await wa.sendPoll({ threadId: thread.id, question: 'Lunch?', options: ['A', 'B'] })

wa.onPollVote(poll.id, (vote) => {
  console.log(vote.voter.userName, 'picked', vote.selectedOptions)
})
```

Votes are decrypted natively by Zaileys — no `messageSecret` persistence, and it works across restarts for any poll this account sent.

### `native()` — the everything hatch

One method unlocks the **entire Zaileys message builder**, pre-targeted at a thread:

```typescript
await wa.native(thread.id).image(buffer, { viewOnce: true })
await wa.native(thread.id).album([{ type: 'image', src: img1 }, { type: 'image', src: img2 }])
await wa.native(thread.id).list({ title: 'Menu', buttonText: 'Open', sections })
await wa.native(thread.id).text('hey').mentionAll()
```

### Scheduling

```typescript
const scheduled = await thread.schedule('Reminder!', { postAt: new Date(Date.now() + 3600_000) })
await scheduled.cancel() // if you change your mind
```

Scheduled jobs persist in the Zaileys store and survive restarts (with a durable store adapter).

## Configuration

| Option | Default | Description |
| --- | --- | --- |
| `client` / `session` | — | Existing Zaileys `Client`, or `ClientOptions` to create one |
| `adapterName` | `"zaileys"` | Thread-ID prefix; set unique per account for multi-account |
| `userName` | `"zaileys-bot"` | Bot display name |
| `forwardPollVotes` | `true` | Also deliver poll votes to `processMessage` as text |
| `autoMarkRead` | `false` | Mark chats read on inbound messages |
| `richMessages` | `false` | Render `{ markdown }`/`{ ast }` posts as Meta-AI-style rich bubbles (zaileys AIRich) |
| `slashCommands` | `false` | Route prefixed messages (`/cmd args`) to `chat.onSlashCommand` |
| `logger` | Chat SDK logger | Logger override |

## Caveats

- WhatsApp via Zaileys/Baileys is an unofficial API — protocol changes can break things, and accounts risk suspension under WhatsApp's ToS. Use responsibly.
- `fetchMessages` history depth equals what your Zaileys store has seen. Use a durable store (SQLite/Postgres/Redis/Convex) for history that survives restarts.
- No modals, no ephemeral messages — WhatsApp has no equivalent.

## Documentation

- 🌐 [**zeative.github.io/zaileys**](https://zeative.github.io/zaileys/) — full Zaileys documentation: guides, API reference, recipes
- 💬 [**chat-sdk.dev**](https://chat-sdk.dev) — Chat SDK documentation
- 📦 [**zaileys**](https://github.com/zeative/zaileys) — the engine underneath this adapter

## Issues & feedback

Hit a problem or have a feature request? Open an [issue](https://github.com/zeative/chat-adapter-zaileys/issues).

- [Buy me a coffee ☕](https://saweria.co/zaadevofc) • [Ko-Fi](https://ko-fi.com/zaadevofc) • [Trakteer](https://trakteer.id/zaadevofc)
- ⭐ Star the repo on GitHub

## License

Distributed under the **MIT License**. See [`LICENSE`](https://github.com/zeative/chat-adapter-zaileys/blob/main/LICENSE) for details.

<div align="left">
  <p>
    <img alt="chat-adapter-zaileys" src="https://github.com/zeative/chat-adapter-zaileys/blob/main/public/icon.png?raw=true" width="28" align="center">
    Copyright © 2026 zaadevofc. All rights reserved.
  </p>
</div>
