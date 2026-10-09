/**
 * Keeper HTTP status API.
 *
 * Read-only HTTP API serving keeper state to the dashboard and operators.
 * Endpoints:
 *   GET /health         - liveness probe
 *   GET /status         - overall keeper status
 *   GET /contracts      - last known contract entry statuses
 *   GET /runs           - recent check run history
 *
 * Optional bearer token authentication via EVERGREEN_KEEPER_API_TOKEN.
 * No write endpoints are exposed.
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { StateStore } from "./state-store.js";
import type { ContractStatus } from "@evergreen/core";

export interface HttpApiOptions {
  port: number;
  /** Bearer token to require in Authorization header. Optional. */
  token?: string;
  network: string;
  signerConfigured: boolean;
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(json),
    "X-Content-Type-Options": "nosniff",
  });
  res.end(json);
}

function unauthorized(res: ServerResponse) {
  sendJson(res, 401, { error: "Unauthorized" });
}

function notFound(res: ServerResponse) {
  sendJson(res, 404, { error: "Not Found" });
}

function checkAuth(req: IncomingMessage, token: string | undefined): boolean {
  if (!token) return true;
  const authHeader = req.headers["authorization"] ?? "";
  return authHeader === `Bearer ${token}`;
}

export class HttpStatusApi {
  private server: ReturnType<typeof createServer>;
  private lastStatuses: ContractStatus[] = [];
  private startedAt = new Date();

  constructor(
    private readonly store: StateStore,
    private readonly opts: HttpApiOptions
  ) {
    this.server = createServer((req, res) => {
      this.handleRequest(req, res);
    });
  }

  /** Update the last known statuses (called after each check cycle). */
  updateStatuses(statuses: ContractStatus[]) {
    this.lastStatuses = statuses;
  }

  private handleRequest(req: IncomingMessage, res: ServerResponse) {
    // CORS headers for dashboard
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Authorization");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method !== "GET") {
      sendJson(res, 405, { error: "Method Not Allowed" });
      return;
    }

    if (!checkAuth(req, this.opts.token)) {
      unauthorized(res);
      return;
    }

    const url = new URL(req.url ?? "/", `http://localhost`);

    switch (url.pathname) {
      case "/health":
        sendJson(res, 200, { status: "ok", uptime: Math.floor((Date.now() - this.startedAt.getTime()) / 1000) });
        break;

      case "/status": {
        const overallStatuses = this.lastStatuses.map((s) => s.overallStatus);
        const hasArchived = overallStatuses.some((s) => s === "archived");
        const hasCritical = overallStatuses.some((s) => s === "critical");
        const hasWarning = overallStatuses.some((s) => s === "warning");
        const overall = hasArchived ? "archived" : hasCritical ? "critical" : hasWarning ? "warning" : "healthy";
        sendJson(res, 200, {
          overall,
          contractCount: this.lastStatuses.length,
          lastCheck: this.lastStatuses[0]?.checkedAt ?? null,
          currentLedger: this.lastStatuses[0]?.entries[0]?.currentLedger ?? null,
          uptime: Math.floor((Date.now() - this.startedAt.getTime()) / 1000),
          network: this.opts.network,
          operatingMode: this.opts.signerConfigured ? "automatic" : "read-only",
        });
        break;
      }

      case "/contracts":
        sendJson(res, 200, {
          contracts: this.lastStatuses.map((s) => ({
            ...s,
            checkedAt: s.checkedAt.toISOString(),
            entries: s.entries.map((e) => ({
              ...e,
              expiresAt: e.expiresAt.toISOString(),
            })),
          })),
        });
        break;

      case "/runs":
        sendJson(res, 200, { runs: this.store.getRecentRuns(50) });
        break;

      default:
        notFound(res);
    }
  }

  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.server.listen(this.opts.port, () => {
        console.log(`[keeper-api] Listening on port ${this.opts.port}`);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}
