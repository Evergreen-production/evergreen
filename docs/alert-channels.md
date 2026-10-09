# 🔔 Alert Channel Extension Guide

Evergreen features a pluggable notification architecture. All alert channels implement a minimal `AlertChannel` TypeScript interface.

---

## 🛠️ Implementing a Custom Alert Channel in ~30 Lines

To create a new alert channel (e.g. Telegram, PagerDuty, Email):

### 1. Implement the `AlertChannel` Interface

Create a new file in `packages/keeper/src/alerts.ts` (or your custom module):

```typescript
import type { AlertChannel, AlertPayload } from "./alerts.js";

export class TelegramAlertChannel implements AlertChannel {
  constructor(
    private readonly botToken: string,
    private readonly chatId: string,
  ) {}

  async send(payload: AlertPayload): Promise<void> {
    const text = `*${payload.title}*\n${payload.message}\nLevel: ${payload.level}`;

    const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: this.chatId,
        text,
        parse_mode: "Markdown",
      }),
    });

    if (!resp.ok) {
      throw new Error(
        `Telegram notification failed: ${resp.status} ${resp.statusText}`,
      );
    }
  }
}
```

### 2. Register in `createAlertChannels` Factory

In `packages/keeper/src/alerts.ts`, add your channel type to the factory switch statement:

```typescript
export function createAlertChannels(
  channelConfigs: AlertChannelConfig[],
): AlertChannel[] {
  return channelConfigs.map((cfg) => {
    switch (cfg.type) {
      case "slack":
        return new SlackAlertChannel(cfg.url);
      case "discord":
        return new DiscordAlertChannel(cfg.url);
      case "webhook":
        return new WebhookAlertChannel(cfg.url, cfg.token);
      case "telegram":
        return new TelegramAlertChannel(cfg.token!, cfg.url);
      default:
        throw new Error(`Unknown alert channel type: ${cfg.type}`);
    }
  });
}
```

---

## ⚡ Alert Triggers & Cooldown Deduplication

Evergreen automatically triggers alerts for:

- Entry status transition to `warning`, `critical`, or `archived`
- Extend or restore operation failure
- Daily spend cap reached or exceeded
- Keeper account balance below `min_keeper_balance_stroops`

To prevent alert spam on every check cycle, the `AlertManager` wraps channel dispatch with a **cooldown registry** backed by SQLite. Identical alerts (same contract, entry key, and alert level) are suppressed for the cooldown period (default: 4 hours). When an entry returns to `healthy`, its cooldown record is cleared so future warnings will fire immediately.
