import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { paths } from "../paths.js";
import type { Server, ServerList, ServerType } from "../types.js";
import { displayName, inferProvider, inferType } from "./infer.js";
import { normalizeUrl } from "./normalize.js";
import { compareVersions, validateServerList } from "./validate.js";

/** data/servers.json location for both dist/ (bundled) and src/servers/ (dev, tests). */
export function bundledListPath(): string {
  const candidates = ["../data/servers.json", "../../data/servers.json"].map((p) =>
    fileURLToPath(new URL(p, import.meta.url)),
  );
  const found = candidates.find((p) => existsSync(p));
  if (!found) throw new Error("bundled data/servers.json not found");
  return found;
}

export function readBundledList(): ServerList {
  return JSON.parse(readFileSync(bundledListPath(), "utf8")) as ServerList;
}

/** Cached remote list (from `update`) if it is valid and newer than the bundled one. */
export function readCachedList(bundledVersion: string): ServerList | undefined {
  try {
    const data = JSON.parse(readFileSync(paths.cachedServers, "utf8")) as ServerList;
    if (validateServerList(data).length) return undefined;
    return compareVersions(data.version, bundledVersion) > 0 ? data : undefined;
  } catch {
    return undefined;
  }
}

/** Build a Server from a bare URL. */
export function serverFromUrl(raw: string, provider?: string, type?: ServerType): Server | null {
  const url = normalizeUrl(raw);
  if (!url) return null;
  const u = new URL(url);
  return {
    url,
    name: displayName(u),
    provider: provider ?? inferProvider(u.hostname) ?? "Custom",
    type: type ?? inferType(u),
  };
}

/** Parse a user list: JSON (ServerList or Server[] or string[]) or text with one URL per line (# comments). */
export function parseCustomList(content: string): Server[] {
  const text = content.trim();
  if (text.startsWith("{") || text.startsWith("[")) {
    const data = JSON.parse(text) as unknown;
    const items = Array.isArray(data) ? data : (data as ServerList).servers;
    if (!Array.isArray(items)) throw new Error("JSON list must be an array or { servers: [] }");
    return items.flatMap((it: unknown) => {
      if (typeof it === "string") return serverFromUrl(it, "Custom") ?? [];
      const s = it as Partial<Server>;
      const base = s.url ? serverFromUrl(s.url, s.provider, s.type) : null;
      return base ? [{ ...base, ...(s.name ? { name: s.name } : {}) }] : [];
    });
  }
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/#.*/, "").trim())
    .filter(Boolean)
    .flatMap((l) => serverFromUrl(l, "Custom") ?? []);
}

export function dedupe(servers: Server[]): Server[] {
  const seen = new Set<string>();
  return servers.filter((s) => {
    const key = normalizeUrl(s.url) ?? s.url;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export interface LoadOptions {
  /** custom list file; replaces the built-in list */
  list?: string;
  /** extra URLs appended */
  add?: string[];
  /** use ~/.bd-ftp-checker/servers.json when newer (default true) */
  useCache?: boolean;
}

export interface LoadedServers {
  servers: Server[];
  source: "bundled" | "cache" | "custom";
  version?: string;
}

export async function loadServers(opts: LoadOptions = {}): Promise<LoadedServers> {
  let result: LoadedServers;
  if (opts.list) {
    result = { servers: parseCustomList(await readFile(opts.list, "utf8")), source: "custom" };
  } else {
    const bundled = readBundledList();
    const cached = opts.useCache === false ? undefined : readCachedList(bundled.version);
    const list = cached ?? bundled;
    result = { servers: list.servers, source: cached ? "cache" : "bundled", version: list.version };
  }
  const extra = (opts.add ?? []).flatMap((u) => serverFromUrl(u, "Custom") ?? []);
  result.servers = dedupe([...result.servers, ...extra]);
  return result;
}

export interface FilterOptions {
  provider?: string[];
  type?: string[];
  search?: string;
}

/** Case-insensitive substring match on provider; exact on type; substring on url/name/provider for search. */
export function filterServers(servers: Server[], f: FilterOptions): Server[] {
  const providers = (f.provider ?? []).map((p) => p.toLowerCase());
  const types = (f.type ?? []).map((t) => t.toLowerCase());
  const q = f.search?.toLowerCase();
  return servers.filter(
    (s) =>
      (providers.length === 0 || providers.some((p) => s.provider.toLowerCase().includes(p))) &&
      (types.length === 0 || types.includes(s.type)) &&
      (!q || `${s.url} ${s.name} ${s.provider}`.toLowerCase().includes(q)),
  );
}
