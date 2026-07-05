# Troubleshooting & FAQ

> Source: https://zeative.github.io/chat-adapter-zaileys/troubleshooting

# Troubleshooting & FAQ

## Known limits

| Limit | Why | Workaround |
| --- | --- | --- |
| No modals / ephemeral messages | WhatsApp has no equivalent | `thread.postEphemeral` falls back to DM when `fallbackToDM: true` |
| `fetchMessages` forward pagination throws | The Zaileys store paginates by `before`-timestamp only | Paginate backward (the default) |
| History starts when the store starts | WhatsApp has no REST history API | Use a durable store (SQLite/Postgres/Redis/Convex) from day one |
| `sent.edit()` is text-only | SDK edit path renders postables to text | `wa.native()` + `client.edit(key)` for media edits |
| Card `LinkButton` / selects not rendered | WhatsApp buttons are reply-buttons | URL in the card body, or `native().buttons([{ type: 'url', … }])` |
| `native()` sends aren't `isMe`-tracked | Builder bypasses the adapter's send path | Use `thread.post` when echo detection matters |

## Common issues

### Messages arrive but no handler fires

Handlers must be registered **before** `adapter.connect()`. Also check the thread is subscribed — unsubscribed group messages only reach `onNewMention` when the bot is @-tagged.

### `senderUsername` / usernames

WhatsApp does not disclose usernames on demand (the USync `username` query is privacy-gated server-side). Rely on `author.fullName` (push name) and `author.userId` (phone jid).

### Reactions in groups don't land

Reacting to another member's message in a group needs the participant jid. Pass it as the 4th argument: `adapter.addReaction(threadId, messageId, emoji, participantJid)`.

### QR loop / logged out

Delete the auth folder (`./.zaileys/auth/<sessionId>`) and re-scan. After an explicit logout WhatsApp invalidates the session — reconnection is only automatic for transient drops.

### Account safety

This is an **unofficial API**. To reduce ban risk: don't spam, respect `broadcast` rate limits, keep `autoMarkRead`/presence human-like, and avoid mass cold outreach. You use it at your own risk under WhatsApp's ToS.

Client-level issues (auth stores, media processing, Termux installs, runtime quirks) are covered in [Zaileys → Troubleshooting](https://zeative.github.io/zaileys/troubleshooting).

## Still stuck?

- Open an issue: [github.com/zeative/chat-adapter-zaileys/issues](https://github.com/zeative/chat-adapter-zaileys/issues)
- Ask in [Discord](https://discord.gg/KBHhTTVUc5) or the [WhatsApp group](https://chat.whatsapp.com/GlQfvc83mSH3F6ov06vuCt)
