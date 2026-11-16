import http, { type IncomingMessage, type RequestOptions } from "node:http";
import https from "node:https";
import { isIP, type LookupFunction, type Socket } from "node:net";
import tls from "node:tls";
import type { CheckResult, CheckStatus, Server } from "../types.js";
import { classifyError, errorMessage } from "./errors.js";

export const USER_AGENT = "bd-ftp-checker/2 (+https://github.com/MHNahib/bd-ftp-checker)";

/** HEAD answers that often mean "HEAD not supported" rather than "down". */
const HEAD_FALLBACK = new Set([400, 403, 404, 405, 500, 501]);
const REDIRECT = new Set([301, 302, 303, 307, 308]);

export interface ProbeContext {
  timeout: number;
  maxRedirects: number;
  lookup?: LookupFunction;
  httpAgent?: http.Agent;
  httpsAgent?: https.Agent;
}

interface Answer {
  status: number;
  location?: string;
}

function requestOnce(
  url: URL,
  method: "HEAD" | "GET",
  ctx: ProbeContext,
  timeoutMs: number,
  socket?: Socket,
): Promise<Answer> {
  const isHttps = url.protocol === "https:";
  const mod = isHttps ? https : http;
  const opts: RequestOptions & tls.ConnectionOptions = {
    method,
    headers: {
      "user-agent": USER_AGENT,
      accept: "*/*",
      ...(method === "GET" ? { range: "bytes=0-0" } : {}),
    },
    signal: AbortSignal.timeout(timeoutMs),
  };
  if (ctx.lookup) opts.lookup = ctx.lookup;
  // Reachability check, not a security check: many BDIX servers use self-signed / expired certs.
  if (isHttps) opts.rejectUnauthorized = false;

  if (socket) {
    opts.agent = false;
    opts.createConnection = () =>
      isHttps
        ? tls.connect({
            socket,
            rejectUnauthorized: false,
            ...(isIP(url.hostname) ? {} : { servername: url.hostname }),
          })
        : socket;
  } else {
    opts.agent = isHttps ? ctx.httpsAgent : ctx.httpAgent;
  }

  return new Promise<Answer>((resolve, reject) => {
    const req = mod.request(url, opts, (res: IncomingMessage) => {
      const answer: Answer = { status: res.statusCode ?? 0 };
      if (res.headers.location) answer.location = res.headers.location;
      // HEAD has no body -> drain keeps the keep-alive socket reusable.
      // GET may ignore Range and stream a whole movie -> cut it.
      // Pre-check socket is single-use (agent: false) -> close it, or it lingers until the
      // server's idle timeout and keeps the process alive.
      if (method === "HEAD" && !socket) res.resume();
      else res.destroy();
      if (socket) {
        req.destroy();
        socket.destroy();
      }
      resolve(answer);
    });
    req.once("error", (err) => {
      socket?.destroy();
      reject(err);
    });
    req.end();
  });
}

export function statusFromHttp(code: number): CheckStatus {
  if (code >= 200 && code < 400) return "ok";
  if (code === 416) return "ok"; // range not satisfiable -> server is answering
  if (code === 401 || code === 403) return "restricted";
  return "http_error";
}

/**
 * HTTP probe: HEAD first, ranged GET fallback on HEAD-hostile answers,
 * follows redirects. `socket` (from the TCP pre-check) is used for the first request.
 */
export async function probe(
  server: Server,
  ctx: ProbeContext,
  socket?: Socket,
): Promise<Omit<CheckResult, "server" | "connectMs">> {
  const start = performance.now();
  const deadline = start + ctx.timeout * 2;
  const budget = () => Math.max(1, Math.min(ctx.timeout, deadline - performance.now()));

  let url = new URL(server.url);
  let method: "HEAD" | "GET" = "HEAD";
  let pending = socket;
  let redirects = 0;
  let attempts = 0;

  try {
    while (attempts++ < ctx.maxRedirects + 4) {
      let ans: Answer;
      try {
        ans = await requestOnce(url, method, ctx, budget(), pending);
      } catch (err) {
        pending = undefined;
        // some servers just drop HEAD
        if (method === "HEAD" && classifyError(err) === "reset") {
          method = "GET";
          continue;
        }
        throw err;
      }
      pending = undefined;

      if (method === "HEAD" && HEAD_FALLBACK.has(ans.status)) {
        method = "GET";
        continue;
      }
      if (REDIRECT.has(ans.status) && ans.location && redirects < ctx.maxRedirects) {
        redirects++;
        url = new URL(ans.location, url);
        continue;
      }
      const status = statusFromHttp(ans.status);
      return {
        status,
        up: status === "ok" || status === "restricted",
        httpStatus: ans.status,
        latencyMs: Math.round(performance.now() - start),
        method,
        finalUrl: url.href,
      };
    }
    return { status: "error", up: false, error: "too many attempts" };
  } catch (err) {
    pending?.destroy();
    return {
      status: classifyError(err),
      up: false,
      error: errorMessage(err),
      method,
    };
  }
}
