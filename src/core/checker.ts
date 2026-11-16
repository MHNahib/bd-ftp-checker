import http from "node:http";
import https from "node:https";
import type { CheckOptions, CheckResult, ScanSummary, Server } from "../types.js";
import { createDnsCache } from "./dns.js";
import { classifyError, errorMessage } from "./errors.js";
import { mapPool } from "./pool.js";
import { probe } from "./probe.js";
import { createTcpPrecheck } from "./tcp.js";

export const DEFAULTS = {
  concurrency: 256,
  timeout: 3000,
  tcpPrecheck: true,
  maxRedirects: 3,
} as const;

/** Order: up first, then by latency, then name. */
export function sortResults(results: CheckResult[]): CheckResult[] {
  return [...results].sort((a, b) => {
    if (a.up !== b.up) return a.up ? -1 : 1;
    const la = a.latencyMs ?? Number.POSITIVE_INFINITY;
    const lb = b.latencyMs ?? Number.POSITIVE_INFINITY;
    if (la !== lb) return la - lb;
    return a.server.name.localeCompare(b.server.name);
  });
}

function defaultPort(url: URL): number {
  if (url.port) return Number(url.port);
  return url.protocol === "https:" ? 443 : 80;
}

/**
 * Check every server and return results sorted fastest-first.
 *
 * Tip for API users: set `UV_THREADPOOL_SIZE=64` (env, before Node starts any fs/dns work) —
 * DNS lookups use the libuv threadpool, and the default 4 threads cause false timeouts.
 */
export async function checkServers(
  servers: readonly Server[],
  options: CheckOptions = {},
): Promise<ScanSummary> {
  const timeout = options.timeout ?? DEFAULTS.timeout;
  const concurrency = options.concurrency ?? DEFAULTS.concurrency;
  const maxRedirects = options.maxRedirects ?? DEFAULTS.maxRedirects;
  const usePrecheck = options.tcpPrecheck ?? DEFAULTS.tcpPrecheck;

  const startedAt = new Date().toISOString();
  const t0 = performance.now();
  const dns = createDnsCache();
  const agentOpts = { keepAlive: true, maxSockets: 4, lookup: dns.lookup };
  const httpAgent = new http.Agent(agentOpts);
  const httpsAgent = new https.Agent({ ...agentOpts, rejectUnauthorized: false });
  const precheck = usePrecheck ? createTcpPrecheck(timeout, dns.lookup) : undefined;
  const ctx = { timeout, maxRedirects, lookup: dns.lookup, httpAgent, httpsAgent };

  let done = 0;
  const total = servers.length;

  async function checkOne(server: Server): Promise<CheckResult> {
    let url: URL;
    try {
      url = new URL(server.url);
    } catch {
      return { server, status: "error", up: false, error: "invalid url" };
    }

    let connectMs: number | undefined;
    let address: string | undefined;
    let socket: import("node:net").Socket | undefined;
    if (precheck) {
      try {
        const pre = await precheck(url.hostname.replace(/^\[|\]$/g, ""), defaultPort(url));
        connectMs = Math.round(pre.connectMs);
        socket = pre.socket;
        address = pre.address;
      } catch (err) {
        return { server, status: classifyError(err), up: false, error: errorMessage(err) };
      }
    }
    const res = await probe(server, ctx, socket);
    return {
      server,
      ...res,
      ...(address ? { address } : {}),
      ...(connectMs !== undefined ? { connectMs } : {}),
    };
  }

  const raw = await mapPool(
    servers,
    concurrency,
    async (server) => {
      const result = await checkOne(server);
      done++;
      options.onResult?.(result, done, total);
      return result;
    },
    options.signal,
  );

  httpAgent.destroy();
  httpsAgent.destroy();

  const results = sortResults(raw.filter(Boolean));
  return {
    results,
    total,
    up: results.filter((r) => r.up).length,
    durationMs: Math.round(performance.now() - t0),
    startedAt,
  };
}
