# chat-adapter-zaileys

WhatsApp adapter for [Chat SDK](https://chat-sdk.dev), powered by [zaileys](https://github.com/zeative/zaileys).

zaileys handles the entire WhatsApp lifecycle for you — QR / pairing-code auth, session persistence, reconnection, LID → phone-number mapping, and message decoding — so the adapter stays thin and your bot code stays clean.

## Why this over a raw-Baileys adapter?

| Capability | chat-adapter-zaileys | raw Baileys adapters |
|---|---|---|
| Message history (`thread.fetchMessages`) | ✅ real, backed by the zaileys message store (memory/SQLite/Postgres/Redis/Convex) | ❌ empty arrays |
| Cards & buttons (`chat.onAction`) | ✅ rendered as native WhatsApp buttons, clicks round-trip to `onAction` | ❌ fallback text only |
| Poll votes | ✅ decrypted natively by zaileys — works across restarts, zero bookkeeping | ⚠️ manual `messageSecret` persistence |
| Scheduled messages (`scheduleMessage`) | ✅ native, persisted through the zaileys scheduler | ❌ |
| Auth & reconnect | ✅ QR terminal / pairing code built in, auto-reconnect | ⚠️ wire `onQR`/reconnect yourself |
| Rich sends | ✅ image/video/audio/document/sticker (incl. animated Lottie), location, polls | ⚠️ partial |
| Raw escape hatch | `message.raw.context` = full zaileys `MessageContext` (media helpers, reply/react, citation) | plain `WAMessage` |

## Install

```bash
npm install chat-adapter-zaileys zaileys chat
```

## Quickstart

```typescript
import { Chat, memoryState } from "chat";
import { createZaileysAdapter } from "chat-adapter-zaileys";

const whatsapp = createZaileysAdapter({
  session: { sessionId: "main" }, // QR prints to the terminal on first run
});

const bot = new Chat({
  userName: "mybot",
  adapters: { whatsapp },
  state: memoryState(),
});

bot.onNewMention(async (thread, message) => {
  await thread.subscribe();
  await thread.post(`Hello, ${message.author.fullName}!`);
});

await bot.initialize();
await whatsapp.connect(); // register handlers first, then connect
```

Pairing-code login instead of QR:

```typescript
const whatsapp = createZaileysAdapter({
  session: { sessionId: "main", authType: "pairing", phoneNumber: "62812xxxxxxx" },
});
```

Bring your own zaileys client (full control — plugins, stores, citation, commands):

```typescript
import { Client, SqliteMessageStore } from "zaileys";

const client = new Client({
  sessionId: "main",
  store: new SqliteMessageStore({ path: "./wa.db" }), // durable history for fetchMessages
});
const whatsapp = createZaileysAdapter({ client });
```

## Cards → native WhatsApp buttons

```tsx
bot.onNewMention(async (thread) => {
  await thread.post(
    <Card title="Deploy?">
      <Actions>
        <Button id="deploy" value="prod">Ship it</Button>
        <Button id="cancel">Cancel</Button>
      </Actions>
    </Card>
  );
});

bot.onAction("deploy", async (event) => {
  await event.thread?.post(`Deploying ${event.value}…`);
});
```

## WhatsApp-native extensions

Available on the adapter (narrow with `requireZaileysAdapter(thread)`):

```typescript
import { requireZaileysAdapter } from "chat-adapter-zaileys";

bot.onSubscribedMessage(async (thread, message) => {
  const wa = requireZaileysAdapter(thread);

  await wa.markRead(thread.id);                       // blue ticks
  await wa.reply(message, "Got it!");                 // native quoted reply
  await wa.sendLocation({ threadId: thread.id, latitude: -6.2, longitude: 106.8 });
  await wa.sendSticker(thread.id, stickerBuffer);     // auto webp conversion
  const poll = await wa.sendPoll({ threadId: thread.id, question: "Lunch?", options: ["A", "B"] });
  wa.onPollVote(poll.id, (vote) => console.log(vote.voter.userName, vote.selectedOptions));

  const participants = await wa.fetchGroupParticipants(thread.id);
  await wa.setPresence("available");
  await wa.sendVoiceNote(thread.id, oggBuffer);       // push-to-talk bubble
  await wa.sendContact(thread.id, vcardString);
  await wa.startRecording(thread.id);                 // "recording audio…" indicator
  await wa.forwardMessage(thread.id, message.id, otherThreadId);
  await wa.pinMessage(thread.id, message.id);
});
```

### `native()` — the everything hatch

One method unlocks the **entire zaileys message builder**, pre-targeted at a thread:

```typescript
await wa.native(thread.id).image(buffer, { viewOnce: true });
await wa.native(thread.id).album([{ kind: "image", src: img1 }, { kind: "image", src: img2 }]);
await wa.native(thread.id).list({ title: "Menu", buttonText: "Open", sections });
await wa.native(thread.id).event({ name: "Standup", startTime });
await wa.native(thread.id).text("hey").mentionAll();
```

Everything else (groups, communities, newsletters, privacy, business catalogs, broadcast, plugins, LID↔PN mapping) is one hop away via `adapter.client` — the full zaileys `Client`.

Media attachments also survive the SDK's `queue`/`debounce` concurrency strategies: the adapter implements `rehydrateAttachment`, re-downloading media by message key from the zaileys store.

## Scheduling

```typescript
const scheduled = await thread.schedule("Reminder!", { postAt: new Date(Date.now() + 3600_000) });
await scheduled.cancel(); // if you change your mind
```

Scheduled jobs persist in the zaileys store and survive restarts (with a durable store adapter).

## Configuration

| Option | Default | Description |
|---|---|---|
| `client` / `session` | — | Existing zaileys `Client`, or `ClientOptions` to create one |
| `adapterName` | `"zaileys"` | Thread-ID prefix; set unique per account for multi-account |
| `userName` | `"zaileys-bot"` | Bot display name |
| `forwardPollVotes` | `true` | Also deliver poll votes to `processMessage` as text |
| `autoMarkRead` | `false` | Mark chats read on inbound messages |
| `logger` | Chat SDK logger | Logger override |

## Caveats

- WhatsApp via zaileys/Baileys is an unofficial API — protocol changes can break things, and accounts risk suspension under WhatsApp's ToS. Use responsibly.
- `fetchMessages` history depth equals what your zaileys store has seen. Use a durable store (SQLite/Postgres/Redis/Convex) for history that survives restarts.
- No modals, no ephemeral messages — WhatsApp has no equivalent.

## License

MIT
