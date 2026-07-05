# Message History

> Source: https://zeative.github.io/chat-adapter-zaileys/history

# Message History

WhatsApp has no REST history API, so raw-Baileys adapters return empty arrays. This adapter implements `fetchMessages` for real, backed by the [Zaileys message store](https://zeative.github.io/zaileys/storage) — every message the client sees is persisted and queryable.

## Fetching

```typescript
const recent = await thread.fetchMessages({ limit: 50 })
// recent.messages — chronological (oldest → newest), full Message objects

const older = await thread.fetchMessages({ limit: 50, cursor: recent.nextCursor })
```

- Pagination is **backward** (newest first, cursor moves to older messages) — the natural direction for chat views. `direction: 'forward'` throws a `ValidationError` since the store paginates by `before`-timestamp only.
- `nextCursor` is omitted when there is nothing older.
- `fetchChannelMessages` delegates to `fetchMessages` (a WhatsApp chat has no channel/thread split).
- `fetchMessage(threadId, messageId)` looks up a single stored message.

History messages are parsed from stored `WAMessage`s — text, captions, author, and timestamps are populated; the live [`MessageContext`](/payload) (`zaileysContext`) is only present on real-time messages.

## Depth = your store

History depth equals what your Zaileys store has seen. The in-memory default forgets on restart — give the client a durable adapter:

```typescript

const client = new Client({
  sessionId: 'main',
  store: new SqliteMessageStore({ database: './wa.db' }),
})
const whatsapp = createZaileysAdapter({ client })
```

Available backends: `memory` (default), `sqlite`, `redis`, `postgres`, `convex` — see [Zaileys → Storage Adapters](https://zeative.github.io/zaileys/storage).

Because history is real, the adapter sets `persistThreadHistory: false` — the SDK does not need to duplicate messages into its own state adapter.

## Media rehydration

When you use `queue` / `debounce` / `burst` concurrency, the SDK serializes messages — normally destroying attachment download closures. The adapter implements `rehydrateAttachment`: it stores the message key in `fetchMetadata` and rebuilds `fetchData` on rehydration, re-downloading media through `client.downloadMedia(key)` from the store.

```typescript
const bot = new Chat({
  adapters: { whatsapp },
  state: myState,
  concurrency: 'queue', // attachments still download after dequeue
  /* … */
})
```
