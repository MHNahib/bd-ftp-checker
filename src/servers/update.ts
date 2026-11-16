import { writeFile } from "node:fs/promises";
import { ensureDir, paths } from "../paths.js";
import type { ServerList } from "../types.js";
import { readBundledList, readCachedList } from "./load.js";
import { compareVersions, validateServerList } from "./validate.js";

export const REMOTE_LIST_URL =
  "https://raw.githubusercontent.com/MHNahib/bd-ftp-checker/main/data/servers.json";

export interface UpdateResult {
  updated: boolean;
  version: string;
  previousVersion: string;
  count: number;
}

/** Fetch the latest server list from GitHub and cache it if newer. */
export async function updateServerList(
  url = REMOTE_LIST_URL,
  timeoutMs = 15_000,
): Promise<UpdateResult> {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`download failed: HTTP ${res.status}`);
  const data = (await res.json()) as ServerList;
  const errors = validateServerList(data);
  if (errors.length) throw new Error(`remote list invalid:\n  ${errors.slice(0, 5).join("\n  ")}`);

  const bundled = readBundledList();
  const current = readCachedList(bundled.version) ?? bundled;
  const updated = compareVersions(data.version, current.version) > 0;
  if (updated) {
    ensureDir(paths.root);
    await writeFile(paths.cachedServers, `${JSON.stringify(data, null, 2)}\n`);
  }
  return {
    updated,
    version: updated ? data.version : current.version,
    previousVersion: current.version,
    count: (updated ? data : current).servers.length,
  };
}
