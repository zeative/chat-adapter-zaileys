# Introduction

> Source: https://zeative.github.io/chat-adapter-zaileys

# Introduction

**chat-adapter-zaileys** is the WhatsApp adapter for [Chat SDK](https://chat-sdk.dev), powered by [Zaileys](https://zeative.github.io/zaileys/). Zaileys handles the entire WhatsApp lifecycle — QR / pairing-code auth, session persistence, reconnection, LID → phone-number mapping, and message decoding — so the adapter stays thin and your bot code stays clean.

```typescript

const whatsapp = createZaileysAdapter({ session: { sessionId: 'main' } })

const bot = new Chat({ userName: 'mybot', adapters: { whatsapp }, state: createMemoryState() })

bot.onNewMention(async (thread, message) => {
  await thread.subscribe()
  await thread.post(`Hello, ${message.author.fullName}!`)
})

await bot.initialize()
await whatsapp.connect()
```

## Why this adapter

| Capability | chat-adapter-zaileys | raw-Baileys adapters |
| --- | --- | --- |
| Message history (`thread.fetchMessages`) | ✅ **real**, backed by the Zaileys message store | ❌ empty arrays |
| Cards & buttons (`chat.onAction`) | ✅ **native WhatsApp buttons**, clicks round-trip | ❌ fallback text only |
| Poll votes | ✅ decrypted natively, zero bookkeeping | ⚠️ manual `messageSecret` persistence |
| Scheduled messages (`thread.schedule`) | ✅ native, persisted | ❌ |
| Auth & reconnect | ✅ built in (QR terminal / pairing code) | ⚠️ wire it yourself |
| Rich sends | ✅ media, stickers (incl. Lottie), voice notes, locations, polls, albums | ⚠️ partial |
| Media in `queue`/`debounce` strategies | ✅ `rehydrateAttachment` | ❌ |
| Raw escape hatch | full Zaileys `MessageContext` | plain `WAMessage` |

## Three layers, 1:1 with Zaileys

Everything Zaileys can do is reachable — by design, in three layers:

1. **Translated to Chat SDK primitives** — messages, reactions, button clicks, poll votes, group joins, and slash commands arrive in the standard `chat.on…` handlers. History, scheduling, streaming, and attachments use the standard SDK APIs.
2. **Named WhatsApp extensions** — things WhatsApp has but the SDK doesn't: [`reply`, `markRead`, `sendPoll`, `sendSticker`, `sendVoiceNote`, `setPresence`, `fetchGroupParticipants`, and more](/extensions).
3. **Escape hatches** — [`native(threadId)`](/extensions#native--the-everything-hatch) exposes the entire Zaileys message builder (albums, carousels, lists, view-once, mentions, …) and `adapter.client` exposes the full Zaileys `Client` (groups, communities, newsletters, privacy, business, plugins).

This site documents the **adapter**. For everything about the underlying client — storage adapters, plugins, commands, media processing — see the [Zaileys documentation](https://zeative.github.io/zaileys/).

## Requirements

- **Node.js v20+**, ESM
- Peer dependencies: [`chat`](https://www.npmjs.com/package/chat) ≥ 4.30 and [`zaileys`](https://www.npmjs.com/package/zaileys) ≥ 4.7 — no direct Baileys dependency

## Fair warning

WhatsApp via Zaileys/Baileys is an **unofficial API**. Protocol changes can break things, and accounts risk suspension under WhatsApp's Terms of Service. Use responsibly.

## Next steps

- [Getting Started](/getting-started) — install, authenticate, first bot
- [Events & Handlers](/events) — how Zaileys events map to Chat SDK handlers
- [Message Payload](/payload) — the rich `MessageContext` behind every message
