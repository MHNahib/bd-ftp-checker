export const SERVER_TYPES = ["ftp", "emby", "jellyfin", "plex", "h5ai", "web"] as const;
export type ServerType = (typeof SERVER_TYPES)[number];

export interface Server {
  url: string;
  name: string;
  provider: string;
  type: ServerType;
}

export interface ServerList {
  version: string;
  updatedAt: string;
  servers: Server[];
}

/**
 * - `ok`          2xx/3xx (after redirects)
 * - `restricted`  401/403 — server is up but needs auth / blocks listing
 * - `http_error`  any other HTTP status (4xx/5xx)
 * - `timeout`     no answer within the timeout
 * - `dns`         hostname did not resolve
 * - `refused`     port closed (ECONNREFUSED)
 * - `unreachable` no route to host / network down
 * - `reset`       connection reset / socket hang up
 * - `tls`         TLS / certificate failure
 * - `error`       anything else
 */
export const CHECK_STATUSES = [
  "ok",
  "restricted",
  "http_error",
  "timeout",
  "dns",
  "refused",
  "unreachable",
  "reset",
  "tls",
  "error",
] as const;
export type CheckStatus = (typeof CHECK_STATUSES)[number];

export interface CheckResult {
  server: Server;
  status: CheckStatus;
  /** true for `ok` and `restricted` */
  up: boolean;
  httpStatus?: number;
  /** total time to response headers (ms) */
  latencyMs?: number;
  /** remote IP the TCP pre-check connected to */
  address?: string;
  /** TCP connect time (ms), when pre-check ran */
  connectMs?: number;
  /** HTTP method that produced the final answer */
  method?: "HEAD" | "GET";
  finalUrl?: string;
  error?: string;
}

export interface CheckOptions {
  /** max simultaneous checks (default 256) */
  concurrency?: number;
  /** per-server timeout in ms (default 3000) */
  timeout?: number;
  /** raw TCP connect before HTTP (default true) */
  tcpPrecheck?: boolean;
  /** max redirects to follow (default 3) */
  maxRedirects?: number;
  /** called after each server finishes */
  onResult?: (result: CheckResult, done: number, total: number) => void;
  signal?: AbortSignal;
}

export interface ScanSummary {
  results: CheckResult[];
  total: number;
  up: number;
  durationMs: number;
  startedAt: string;
}
