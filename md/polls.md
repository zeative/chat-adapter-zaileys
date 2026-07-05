# Polls

> Source: https://zeative.github.io/chat-adapter-zaileys/polls

# Polls

WhatsApp polls are end-to-end encrypted — vote events arrive as opaque `pollUpdateMessage`s. Raw-Baileys adapters make you persist each poll's `messageSecret` and decrypt votes yourself. Here, **Zaileys decrypts votes natively**: no bookkeeping, no TTLs, and it works across restarts for any poll this account sent.

## Sending a poll

```typescript

const wa = requireZaileysAdapter(thread)

const poll = await wa.sendPoll({
  threadId: thread.id,
  question: 'What time works for the call?',
  options: ['10:00', '14:00', '17:00'],
  selectableCount: 1, // any other value allows multiple selections
})
```

## Receiving votes

```typescript
// every poll this account sent
wa.onPollVote((vote) => {
  console.log(vote.voter.userName, '→', vote.selectedOptions)
})

// scoped to one (or several) polls
wa.onPollVote(poll.id, async (vote) => {
  await thread.post(`${vote.voter.userName} picked ${vote.selectedOptions[0]}`)
})
wa.onPollVote([pollA.id, pollB.id], handler)
```

The `ZaileysPollVote` payload:

| Field | Type | Notes |
| --- | --- | --- |
| `threadId` | `string` | Where the poll lives |
| `pollMessageId` | `string` | Id of the original poll message |
| `question` | `string \| null` | Recovered from the message store when available |
| `options` | `string[]` | Same — empty if the poll left the store |
| `selectedOptions` | `string[]` | Current selection; **empty = vote cleared** |
| `voter` | `Author` | Chat SDK author shape |
| `raw` | `PollVotePayload` | The Zaileys payload |

## Votes as messages

By default (`forwardPollVotes: true`) each non-empty vote is also forwarded to the regular message pipeline with the selected options as text — so `onSubscribedMessage` bots see poll answers without extra code:

```typescript
bot.onSubscribedMessage(async (thread, message) => {
  // a vote for "14:00" arrives as message.text === "14:00"
})
```

Set `forwardPollVotes: false` to keep votes exclusively in `onPollVote`.

Polls sent through **any** Zaileys path — `wa.sendPoll`, `native(threadId).poll(…)`, even `client.send(jid).poll(…)` outside the adapter — all produce decryptable votes. There is no "tracked polls" registry to manage.
