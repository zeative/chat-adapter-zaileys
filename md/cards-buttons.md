# Cards & Buttons

> Source: https://zeative.github.io/chat-adapter-zaileys/cards-buttons

# Cards & Buttons

Raw-Baileys adapters degrade Cards to plain text. This adapter renders them as **native WhatsApp buttons** — and button taps come back through the standard `chat.onAction` pipeline.

## Posting a card

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
```

What maps where:

| Card part | WhatsApp |
| --- | --- |
| `title` | Message title |
| `subtitle` | Footer |
| `imageUrl` | Header image |
| Body text / fields | Message body (fallback text) |
| `<Button>` | Native reply button |

## Handling clicks

```typescript
bot.onAction('deploy', async (event) => {
  await event.thread?.post(`Deploying ${event.value}…`) // value = "prod"
})
```

`event.actionId`, `event.value`, `event.user`, and `event.messageId` are all populated. List-row selections (sent via [`native().list(…)`](/extensions#native--the-everything-hatch)) arrive through `onAction` too.

## `callbackUrl` buttons

Buttons with `callbackUrl` work as designed by the SDK — the URL is tokenized into `button.value` (`__cb:…`), the adapter round-trips it, and the SDK POSTs to your callback on tap.

## Encoding & limits

The adapter encodes `actionId` and `value` together into the WhatsApp button id using a newline delimiter, and validates the result against WhatsApp's **256-character** id limit — a `ValidationError` is thrown at post time if exceeded, never a silent truncation.

WhatsApp has no modals, selects, or multi-step forms. `LinkButton` and select elements inside cards are not rendered as buttons — put URLs in the card body instead. For richer input, send a [list message](/extensions#native--the-everything-hatch) or a [poll](/polls).

## Beyond cards: native interactive messages

The full Zaileys interactive surface — URL/copy/call buttons, lists, carousels, templates — is available through `native()`:

```typescript
const wa = requireZaileysAdapter(thread)

await wa.native(thread.id).buttons(
  [
    { id: 'yes', text: 'Yes' },
    { type: 'url', text: 'Open docs', url: 'https://zeative.github.io/zaileys/' },
    { type: 'copy', text: 'Copy code', code: 'ZAILEYS-2026' },
  ],
  { title: 'Pick one', text: 'Tap a button below' },
)

whatsapp.client.on('button-click', (ctx) => console.log('tapped:', ctx.buttonId))
```

See [Zaileys → Interactive Messages](https://zeative.github.io/zaileys/interactive) for every button type and option.
