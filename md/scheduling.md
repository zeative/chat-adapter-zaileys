# Scheduling

> Source: https://zeative.github.io/chat-adapter-zaileys/scheduling

# Scheduling

In the Chat SDK, `scheduleMessage` is normally a Slack-only capability. This adapter implements it natively through the [Zaileys scheduler](https://zeative.github.io/zaileys/automation), so the standard API just works on WhatsApp:

```typescript
const scheduled = await thread.schedule('Reminder: standup in 10 minutes!', {
  postAt: new Date(Date.now() + 3600_000),
})

scheduled.scheduledMessageId // zaileys job id
scheduled.postAt             // Date

await scheduled.cancel()     // change of plans
```

## Persistence

Scheduled jobs are persisted in the Zaileys **message store**. With a durable adapter (SQLite/Postgres/Redis/Convex), pending sends survive process restarts — Zaileys reloads and re-arms them on `connect()`:

```typescript
const client = new Client({
  sessionId: 'main',
  store: new SqliteMessageStore({ database: './wa.db' }),
})
```

With the in-memory default, jobs live only as long as the process.

## Rate limiting

Zaileys throttles scheduled dispatches (default 1/sec, configurable via `scheduleRateLimitPerSec` in `ClientOptions`) so a burst of due jobs doesn't trip WhatsApp's limits.

`thread.schedule` accepts text-shaped postables (string / markdown / ast). To schedule media or interactive content, use the Zaileys scheduler directly with the full builder:

```typescript
await whatsapp.client.scheduleAt(date, (b) =>
  b.to(jid).image('./promo.jpg', { caption: 'Launching today!' }),
)
```
