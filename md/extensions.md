# Extensions & `native()`

> Source: https://zeative.github.io/chat-adapter-zaileys/extensions

# Extensions & `native()`

WhatsApp can do things the Chat SDK has no vocabulary for. The adapter exposes them as typed extension methods — narrow any `Thread`, `Channel`, or adapter with the guards:

```typescript

bot.onSubscribedMessage(async (thread, message) => {
  const wa = requireZaileysAdapter(thread) // throws if not a zaileys thread
  // …
})
```

## Extension reference

| Method | What it does |
| --- | --- |
| `reply(message, content)` | Quoted reply — WhatsApp's native reply bubble. Accepts any postable, media included. |
| `markRead(threadId)` | Send read receipts (blue ticks) for the chat. |
| `setPresence('available' \| 'unavailable')` | Global online/offline status. |
| `startTyping(threadId)` | "typing…" indicator (also used by the SDK automatically). |
| `startRecording(threadId)` | "recording audio…" indicator. |
| `setDisappearing(threadId, seconds)` | Toggle disappearing messages (`0` disables). |
| `sendLocation({ threadId, latitude, longitude, name?, address? })` | Native map-pin message. |
| `sendPoll({ threadId, question, options, selectableCount? })` | Native poll — see [Polls](/polls). |
| `sendSticker(threadId, src)` | Sticker from webp/png/jpeg — Zaileys converts, animated Lottie included. |
| `sendVoiceNote(threadId, src)` | Push-to-talk audio bubble. |
| `sendContact(threadId, vcard)` | Contact card. |
| `forwardMessage(threadId, messageId, toThreadId)` | Forward to another chat. |
| `pinMessage(threadId, messageId)` / `unpinMessage(…)` | Pin / unpin in chat. |
| `fetchGroupParticipants(threadId)` | Members with `isAdmin` / `isSuperAdmin` flags. Throws for non-groups. |
| `getUser(userId)` | `UserInfo` from the contact store + profile picture. |
| `openDM(userId)` | Thread ID for a DM (accepts digits or a jid). |
| `onPollVote(handler)` | Decrypted poll votes — see [Polls](/polls). |

```typescript
const wa = requireZaileysAdapter(thread)

await wa.markRead(thread.id)
await wa.sendLocation({ threadId: thread.id, latitude: -6.2, longitude: 106.8, name: 'Jakarta' })
await wa.sendVoiceNote(thread.id, oggBuffer)

const admins = (await wa.fetchGroupParticipants(thread.id)).filter((p) => p.isAdmin)
```

## `native()` — the everything hatch

One method exposes the **entire Zaileys message builder**, pre-targeted at a thread. Every content type and modifier from [Zaileys → Sending Messages](https://zeative.github.io/zaileys/sending-messages) is available:

```typescript
await wa.native(thread.id).image(buffer, { viewOnce: true })
await wa.native(thread.id).album([
  { type: 'image', src: './a.jpg' },
  { type: 'image', src: './b.jpg' },
])
await wa.native(thread.id).list({ title: 'Menu', buttonText: 'Open', sections })
await wa.native(thread.id).event({ name: 'Standup', startTime })
await wa.native(thread.id).text('hey everyone').mentionAll()
await wa.native(thread.id).text('secret').disappearing(86_400)
```

Text · image · video · video note · audio · document · sticker · buttons · carousel · list · poll · location · contact · template · event · group invite · product · album — plus `.reply()`, `.mentions()`, `.mentionAll()`, `.disappearing()` modifiers. Awaiting the builder returns the sent `WAMessageKey`.

Messages sent through `native()` are not tracked for `author.isMe` echo detection — a minor trade-off for full builder access.

## `adapter.client` — the whole Zaileys client

Everything else lives one property away. Groups, communities, newsletters, privacy, profile, contacts, business catalogs, broadcast, the command framework, plugins, LID↔PN mapping:

```typescript
whatsapp.client.group.promote(groupJid, [userJid])
whatsapp.client.newsletter.create('My Channel', 'Updates')
whatsapp.client.privacy.updateLastSeen('contacts')
whatsapp.client.broadcast(jids, (b) => b.text('Announcement'), { rateLimitPerSec: 5 })
whatsapp.client.command('ping', (ctx) => ctx.reply('pong 🏓'))
```

The complete surface is documented at [zeative.github.io/zaileys](https://zeative.github.io/zaileys/).
