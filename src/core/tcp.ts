import net, { type LookupFunction, type Socket } from "node:net";
import { TimeoutError } from "./errors.js";

export interface TcpResult {
  connectMs: number;
  socket: Socket;
}

/** Open a raw TCP connection. Resolves with the connected socket (caller owns it). */
export function tcpConnect(
  host: string,
  port: number,
  timeoutMs: number,
  lookup?: LookupFunction,
): Promise<TcpResult> {
  return new Promise((resolve, reject) => {
    const start = performance.now();
    const socket = net.connect({ host, port, lookup, noDelay: true });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new TimeoutError(`connect timeout ${host}:${port}`));
    }, timeoutMs);
    socket.once("connect", () => {
      clearTimeout(timer);
      socket.removeAllListeners("error");
      // Safety net: a late RST on an idle socket must not crash the process.
      socket.on("error", () => {});
      resolve({ connectMs: performance.now() - start, socket });
    });
    socket.once("error", (err) => {
      clearTimeout(timer);
      socket.destroy();
      reject(err);
    });
  });
}

/**
 * Memoised pre-check per host:port for one run. The first caller for a
 * host:port gets the live socket (so its HTTP request skips a second handshake);
 * later callers get the cached outcome only.
 */
export interface PrecheckResult {
  connectMs: number;
  /** only for the first caller per host:port */
  socket?: Socket;
  address?: string | undefined;
}

export function createTcpPrecheck(timeoutMs: number, lookup?: LookupFunction) {
  const cache = new Map<string, Promise<PrecheckResult>>();

  return function precheck(host: string, port: number): Promise<PrecheckResult> {
    const key = `${host}:${port}`;
    const hit = cache.get(key);
    if (hit) return hit.then(({ connectMs, address }) => ({ connectMs, address }));
    const p = tcpConnect(host, port, timeoutMs, lookup).then((r) => ({
      ...r,
      address: r.socket.remoteAddress,
    }));
    cache.set(key, p);
    return p;
  };
}
