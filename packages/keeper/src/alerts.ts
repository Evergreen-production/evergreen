/**
 * Alert channel interface and implementations.
 *
 * To add a new alert channel:
 * 1. Implement the AlertChannel interface (~30 lines)
 * 2. Add it to the createAlertChannels factory
 * 3. Add the type to AlertChannelConfig in @evergreen/core/types
 *
 * See docs/alert-channels.md for full guide.
 */

import type { AlertChannelConfig } from "@evergreen/core";

// ─── Alert Payload ────────────────────────────────────────────────────────────

export interface AlertPayload {
  level: "warning" | "critical" | "archived" | "recovered" | "error" | "info";
  title: string;
  message: string;
  contractId?: string;
  entryKey?: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

// ─── Alert Channel Interface ──────────────────────────────────────────────────

export interface AlertChannel {
  send(payload: AlertPayload): Promise<void>;
}

// ─── Generic Webhook Channel ──────────────────────────────────────────────────

export class WebhookAlertChannel implements AlertChannel {
  constructor(private readonly url: string, private readonly token?: string) {}

  async send(payload: AlertPayload): Promise<void> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.token) {
      headers["Authorization"] = `Bearer ${this.token}`;
    }

    const body = JSON.stringify({
      level: payload.level,
      title: payload.title,
      message: payload.message,
      contractId: payload.contractId,
      entryKey: payload.entryKey,
      timestamp: payload.timestamp.toISOString(),
      metadata: payload.metadata,
    });

    const resp = await fetch(this.url, { method: "POST", headers, body });
    if (!resp.ok) {
      throw new Error(`Webhook delivery failed: ${resp.status} ${resp.statusText}`);
    }
  }
}

// ─── Slack Incoming Webhook ───────────────────────────────────────────────────

const LEVEL_EMOJI: Record<AlertPayload["level"], string> = {
  warning: "⚠️",
  critical: "🔴",
  archived: "💀",
  recovered: "✅",
  error: "❌",
  info: "ℹ️",
};

export class SlackAlertChannel implements AlertChannel {
  constructor(private readonly webhookUrl: string) {}

  async send(payload: AlertPayload): Promise<void> {
    const emoji = LEVEL_EMOJI[payload.level];
    const text = `${emoji} *${payload.title}*\n${payload.message}`;
    const slackBody = {
      text,
      blocks: [
        {
          type: "section",
          text: { type: "mrkdwn", text },
        },
        ...(payload.contractId
          ? [
              {
                type: "context",
                elements: [
                  {
                    type: "mrkdwn",
                    text: `Contract: \`${payload.contractId}\` | Entry: \`${payload.entryKey ?? "N/A"}\` | ${payload.timestamp.toISOString()}`,
                  },
                ],
              },
            ]
          : []),
      ],
    };

    const resp = await fetch(this.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(slackBody),
    });
    if (!resp.ok) {
      throw new Error(`Slack webhook failed: ${resp.status}`);
    }
  }
}

// ─── Discord Webhook ──────────────────────────────────────────────────────────

const LEVEL_COLOR: Record<AlertPayload["level"], number> = {
  warning: 0xffa500,
  critical: 0xff0000,
  archived: 0x8b0000,
  recovered: 0x00c853,
  error: 0xff0000,
  info: 0x2196f3,
};

export class DiscordAlertChannel implements AlertChannel {
  constructor(private readonly webhookUrl: string) {}

  async send(payload: AlertPayload): Promise<void> {
    const embed = {
      title: `${LEVEL_EMOJI[payload.level]} ${payload.title}`,
      description: payload.message,
      color: LEVEL_COLOR[payload.level],
      timestamp: payload.timestamp.toISOString(),
      fields: [
        ...(payload.contractId
          ? [{ name: "Contract", value: `\`${payload.contractId}\``, inline: true }]
          : []),
        ...(payload.entryKey
          ? [{ name: "Entry", value: `\`${payload.entryKey}\``, inline: true }]
          : []),
      ],
    };

    const resp = await fetch(this.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ embeds: [embed] }),
    });
    if (!resp.ok) {
      throw new Error(`Discord webhook failed: ${resp.status}`);
    }
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/** Create alert channels from config. */
export function createAlertChannels(channelConfigs: AlertChannelConfig[]): AlertChannel[] {
  return channelConfigs.map((cfg) => {
    switch (cfg.type) {
      case "slack":
        return new SlackAlertChannel(cfg.url);
      case "discord":
        return new DiscordAlertChannel(cfg.url);
      case "webhook":
        return new WebhookAlertChannel(cfg.url, cfg.token);
      default:
        throw new Error(`Unknown alert channel type: ${(cfg as AlertChannelConfig).type}`);
    }
  });
}

// ─── Alert Manager ───────────────────────────────────────────────────────────

import type { StateStore } from "./state-store.js";

/** Default alert cooldown: 4 hours. */
const DEFAULT_COOLDOWN_SECONDS = 4 * 60 * 60;

/**
 * AlertManager wraps alert channels with deduplication via StateStore.
 * The same alert (identified by contractId+entryKey+level) will only fire
 * once per cooldown period.
 */
export class AlertManager {
  constructor(
    private readonly channels: AlertChannel[],
    private readonly store: StateStore,
    private readonly cooldownSeconds = DEFAULT_COOLDOWN_SECONDS
  ) {}

  async send(payload: AlertPayload): Promise<void> {
    const cooldownKey = `${payload.contractId ?? "global"}:${payload.entryKey ?? ""}:${payload.level}`;
    const shouldAlert = this.store.shouldAlert(cooldownKey, this.cooldownSeconds);
    if (!shouldAlert) {
      return; // Suppressed by cooldown
    }

    const errs: string[] = [];
    await Promise.allSettled(
      this.channels.map(async (ch) => {
        try {
          await ch.send(payload);
        } catch (err) {
          errs.push(err instanceof Error ? err.message : String(err));
        }
      })
    );

    if (errs.length > 0) {
      console.error(`[alerts] ${errs.length} alert channel(s) failed: ${errs.join("; ")}`);
    }
  }

  /** Clear cooldown for an entry that has recovered. */
  clearCooldown(contractId: string, entryKey: string, level: string) {
    const key = `${contractId}:${entryKey}:${level}`;
    this.store.clearAlertCooldown(key);
  }
}
