import { isIP } from "node:net";
import type { CheckResult } from "../types.js";

export interface IspGuess {
  provider: string;
  confidence: "high" | "medium" | "low";
  reason: string;
}

/** RFC 1918 + CGNAT (100.64/10), which BD ISPs use for in-network servers. */
export function isPrivateIPv4(ip: string): boolean {
  if (isIP(ip) !== 4) return false;
  const [a = 0, b = 0] = ip.split(".").map(Number);
  return (
    a === 10 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

function ipOf(r: CheckResult): string | undefined {
  if (r.address) return r.address.replace(/^::ffff:/, "");
  try {
    return new URL(r.server.url).hostname;
  } catch {
    return undefined;
  }
}

const IGNORED = new Set(["custom", "other", "unknown"]);

/**
 * Guess the user's ISP from scan results, locally.
 * 1. A provider whose private-range servers answer → high (only its own customers can reach those).
 * 2. Otherwise the provider (>= 2 servers) with the best reachable ratio, if clearly ahead.
 */
export function detectIsp(results: CheckResult[]): IspGuess | undefined {
  const stats = new Map<string, { total: number; up: number; privateUp: number }>();
  for (const r of results) {
    const p = r.server.provider;
    if (IGNORED.has(p.toLowerCase())) continue;
    const s = stats.get(p) ?? { total: 0, up: 0, privateUp: 0 };
    s.total++;
    if (r.up) {
      s.up++;
      const ip = ipOf(r);
      if (ip && isPrivateIPv4(ip)) s.privateUp++;
    }
    stats.set(p, s);
  }

  const priv = [...stats.entries()]
    .filter(([, s]) => s.privateUp > 0)
    .sort((a, b) => b[1].privateUp - a[1].privateUp);
  const [topPriv, nextPriv] = priv;
  if (topPriv) {
    const [provider, s] = topPriv;
    const tie = nextPriv && nextPriv[1].privateUp === s.privateUp;
    return {
      provider,
      confidence: tie ? "medium" : "high",
      reason: `${s.privateUp} private-network server(s) of ${provider} reachable`,
    };
  }

  const ranked = [...stats.entries()]
    .filter(([, s]) => s.total >= 2 && s.up > 0)
    .map(([p, s]) => ({ p, s, ratio: s.up / s.total }))
    .sort((a, b) => b.ratio - a.ratio || b.s.up - a.s.up);
  const [best, second] = ranked;
  if (!best || best.ratio < 0.5) return undefined;
  const margin = best.ratio - (second?.ratio ?? 0);
  if (margin < 0.15) return undefined;
  return {
    provider: best.p,
    confidence: margin >= 0.4 ? "medium" : "low",
    reason: `${best.s.up}/${best.s.total} ${best.p} servers reachable`,
  };
}

export function ispNote(g: IspGuess | undefined): string | undefined {
  return g
    ? `You are probably on ${g.provider} (${g.confidence} confidence: ${g.reason})`
    : undefined;
}
