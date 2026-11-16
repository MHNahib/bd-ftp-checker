/**
 * One-off migration: v1 `asset/index.js` (flat URL array, CommonJS) -> `data/servers.json`.
 * Kept for reference; v2 edits data/servers.json directly.
 *
 *   npx tsx scripts/migrate-servers.ts <path-to-v1-list.cjs>
 */
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { displayName, inferProvider, inferType } from "../src/servers/infer.js";
import { normalizeUrl } from "../src/servers/normalize.js";
import type { Server, ServerList } from "../src/types.js";

const src = resolve(process.argv[2] ?? "asset/index.cjs");
const require = createRequire(import.meta.url);
const { servers: urls } = require(src) as { servers: string[] };

/** Free public hosting — always reachable from the internet, so tells nothing about BDIX/FTP. */
const PUBLIC_HOSTS = [
  "sites.google.com",
  "blogspot.com",
  "pastebin.com",
  "wixsite.com",
  "webs.com",
  "yolasite.com",
  "wordpress.com",
  "github.io",
  "iflix.com",
];

const seen = new Set<string>();
const servers: Server[] = [];
let lastProvider = "Unknown";
let dropped = 0;
let dupes = 0;

for (const raw of urls) {
  const url = normalizeUrl(raw);
  if (!url) {
    console.warn(`invalid url skipped: ${raw}`);
    continue;
  }
  const u = new URL(url);
  const host = u.hostname.toLowerCase();
  if (PUBLIC_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) {
    dropped++;
    continue;
  }
  if (seen.has(url)) {
    dupes++;
    continue;
  }
  seen.add(url);

  // v1 list is ordered by ISP, so a bare IP belongs to the entry just before it.
  const provider = inferProvider(host) ?? lastProvider;
  lastProvider = provider;
  servers.push({ url, name: displayName(u), provider, type: inferType(u) });
}

const now = new Date();
const list: ServerList = {
  version: `${now.getFullYear()}.${now.getMonth() + 1}.${now.getDate()}`,
  updatedAt: now.toISOString(),
  servers,
};

writeFileSync(resolve("data/servers.json"), `${JSON.stringify(list, null, 2)}\n`);
console.log(
  `wrote ${servers.length} servers (dropped ${dropped} public-hosted, ${dupes} duplicates) -> data/servers.json`,
);
