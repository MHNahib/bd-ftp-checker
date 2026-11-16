import http, { type IncomingMessage } from "node:http";
import https from "node:https";
import { USER_AGENT } from "./probe.js";

export const MEDIA_EXT = /\.(mkv|mp4|avi|iso|zip|m4v|mov|webm|rar|7z)$/i;

export interface SpeedResult {
  url: string;
  bytes: number;
  seconds: number;
  /** megabytes per second (10^6) */
  MBps: number;
  /** megabits per second */
  Mbps: number;
}

/** GET with redirects; resolves the final 2xx response (body unread). */
export function httpGet(
  url: string,
  timeoutMs: number,
  signal?: AbortSignal,
  redirects = 5,
): Promise<IncomingMessage> {
  return new Promise((resolve, reject) => {
    let u: URL;
    try {
      u = new URL(url);
    } catch {
      reject(new Error(`invalid url: ${url}`));
      return;
    }
    const mod = u.protocol === "https:" ? https : http;
    const req = mod.get(
      u,
      {
        headers: { "user-agent": USER_AGENT, accept: "*/*" },
        rejectUnauthorized: false,
        timeout: timeoutMs,
        ...(signal ? { signal } : {}),
      },
      (res) => {
        const code = res.statusCode ?? 0;
        if (code >= 300 && code < 400 && res.headers.location) {
          res.resume();
          if (redirects <= 0) return reject(new Error("too many redirects"));
          const next = new URL(res.headers.location, u).toString();
          httpGet(next, timeoutMs, signal, redirects - 1).then(resolve, reject);
          return;
        }
        if (code < 200 || code >= 300) {
          res.resume();
          return reject(new Error(`HTTP ${code} for ${url}`));
        }
        resolve(res);
      },
    );
    req.on("timeout", () => req.destroy(new Error("timed out")));
    req.on("error", reject);
  });
}

async function readText(url: string, timeoutMs: number, maxBytes = 2_000_000): Promise<string> {
  const res = await httpGet(url, timeoutMs);
  const type = String(res.headers["content-type"] ?? "");
  if (type && !/html|text/i.test(type)) {
    res.destroy();
    return "";
  }
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of res as AsyncIterable<Buffer>) {
    size += chunk.length;
    chunks.push(chunk);
    if (size > maxBytes) {
      res.destroy();
      break;
    }
  }
  return Buffer.concat(chunks).toString("utf8");
}

/** href targets from an HTML directory listing, resolved and limited to the same host. */
export function extractLinks(html: string, base: string): string[] {
  const baseUrl = new URL(base);
  const out = new Set<string>();
  for (const m of html.matchAll(/href\s*=\s*["']([^"'#]+)["']/gi)) {
    const raw = m[1];
    if (!raw || raw.startsWith("?") || /^(javascript|mailto|data):/i.test(raw)) continue;
    try {
      const u = new URL(raw, baseUrl);
      if (u.host !== baseUrl.host || u.search) continue;
      // only descend (skip parent dir and siblings above base)
      if (!u.pathname.startsWith(baseUrl.pathname.replace(/[^/]*$/, ""))) continue;
      if (u.toString() === baseUrl.toString()) continue;
      out.add(u.toString());
    } catch {
      /* ignore bad href */
    }
  }
  return [...out];
}

/** Breadth-first crawl of directory listings for a media file. */
export async function findMediaFile(
  root: string,
  opts: { depth?: number; timeoutMs?: number; maxPages?: number } = {},
): Promise<string | undefined> {
  const depth = opts.depth ?? 2;
  const timeoutMs = opts.timeoutMs ?? 5000;
  let budget = opts.maxPages ?? 25;
  let level = [root.endsWith("/") ? root : `${root}/`];
  const seen = new Set(level);
  for (let d = 0; d <= depth && level.length; d++) {
    const next: string[] = [];
    for (const page of level) {
      if (budget-- <= 0) return undefined;
      let html: string;
      try {
        html = await readText(page, timeoutMs);
      } catch {
        continue;
      }
      const links = extractLinks(html, page);
      const media = links.find((l) => MEDIA_EXT.test(decodeURIComponent(new URL(l).pathname)));
      if (media) return media;
      for (const l of links) {
        if (l.endsWith("/") && !seen.has(l)) {
          seen.add(l);
          next.push(l);
        }
      }
    }
    level = next;
  }
  return undefined;
}

/** Download `url` for up to `seconds` and report throughput. */
export async function speedTest(
  url: string,
  opts: {
    seconds?: number;
    timeoutMs?: number;
    onProgress?: (bytes: number, secs: number) => void;
  } = {},
): Promise<SpeedResult> {
  const limitMs = (opts.seconds ?? 10) * 1000;
  const ac = new AbortController();
  const res = await httpGet(url, opts.timeoutMs ?? 5000, ac.signal);
  const t0 = performance.now();
  let bytes = 0;
  const timer = setTimeout(() => ac.abort(), limitMs);
  try {
    for await (const chunk of res as AsyncIterable<Buffer>) {
      bytes += chunk.length;
      opts.onProgress?.(bytes, (performance.now() - t0) / 1000);
    }
  } catch (err) {
    if (!ac.signal.aborted) throw err;
  } finally {
    clearTimeout(timer);
    res.destroy();
  }
  const seconds = Math.max(0.001, (performance.now() - t0) / 1000);
  const MBps = bytes / 1e6 / seconds;
  return { url, bytes, seconds, MBps, Mbps: MBps * 8 };
}
