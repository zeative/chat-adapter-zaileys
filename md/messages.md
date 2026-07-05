# Posting Messages

> Source: https://zeative.github.io/chat-adapter-zaileys/messages

# Posting Messages

`thread.post()` accepts every Chat SDK postable shape. The adapter renders it to what WhatsApp actually supports.

## Text & formatting

```typescript
await thread.post('plain text')
await thread.post({ markdown: '**bold** _italic_ ~~strike~~ `code` [docs](https://example.com)' })
```

Markdown / mdast is converted to WhatsApp markup:

| Markdown | WhatsApp |
| --- | --- |
| `**bold**` | `*bold*` |
| `_italic_` | `_italic_` |
| `~~strike~~` | `~strike~` |
| `` `code` `` | `` `code` `` |
| ` ```block``` ` | ` ```block``` ` |
| `[text](url)` | `text (url)` — WhatsApp has no hyperlinks |
| `# Heading` | `*Heading*` |
| `> quote` | `> quote` |

Inbound WhatsApp markup is parsed back to mdast on `message.formatted`, so round-trips are symmetric.

## Rich bubbles (AIRich)

Flip [`richMessages: true`](/configuration#options) and markdown posts render through Zaileys [AIRich](https://zeative.github.io/zaileys/rich-responses) — Meta-AI-style bubbles with syntax-highlighted code blocks, tables, and directives:

```typescript
const whatsapp = createZaileysAdapter({ session: { sessionId: 'main' }, richMessages: true })

await thread.post({
  markdown: ['## Daily brief', '', '```ts', 'const x = 1', '```'].join('\n'),
})
```

Plain-string posts are unaffected — only `{ markdown }` and `{ ast }` shapes go rich.

## Files & attachments

```typescript
await thread.post({
  markdown: 'Here is the report',
  files: [{ data: pdfBuffer, filename: 'report.pdf', mimeType: 'application/pdf' }],
})
```

Routing is by MIME type: `image/*` → image, `video/*` → video, `audio/*` → audio, everything else → document. The text becomes the caption of the first file; additional files send as follow-ups. `Attachment` objects (with `data`, `fetchData`, or `url`) work the same way — URLs are passed to Zaileys, which downloads them for you.

## Streaming

No extra wiring — the SDK's fallback streaming (post + edit) works because the adapter implements `editMessage`:

```typescript
bot.onSubscribedMessage(async (thread) => {
  const stream = await ai.streamText({ /* … */ })
  await thread.post(stream.textStream)
})
```

## Edit, delete, react, typing

```typescript
const sent = await thread.post('Original')
await sent.edit('Fixed')            // → WhatsApp native edit
await sent.addReaction('👍')        // → native reaction
await sent.removeReaction('👍')
await sent.delete()                 // → delete for everyone

await thread.startTyping()          // "typing…" indicator
```

Editing supports text content. To edit media or send anything exotic, use [`native()`](/extensions#native--the-everything-hatch).

## Cards

Cards render as **native WhatsApp buttons** with full `onAction` round-trips — they get their own page: [Cards & Buttons](/cards-buttons).

## Quoted replies

WhatsApp's reply bubble is an adapter extension (the SDK has no quoting concept):

```typescript

bot.onSubscribedMessage(async (thread, message) => {
  const wa = requireZaileysAdapter(thread)
  await wa.reply(message, 'Got it!') // quotes the original, media supported
})
```
