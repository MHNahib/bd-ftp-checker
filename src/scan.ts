import { extname } from "node:path";
import type { Options } from "./config.js";
import { checkServers } from "./core/checker.js";
import { detectIsp, ispNote } from "./core/detect.js";
import { diffScans, loadHistory, relativeTime, type ScanDiff, saveHistory } from "./history.js";
import { CONTRIBUTORS_URL } from "./output/banner.js";
import { type Format, toCsv, toJson, toMarkdown } from "./output/formats.js";
import { toHtml, writeReport } from "./output/html.js";
import { openTarget } from "./output/open.js";
import { banner, type Colors, Progress, summaryText, type Writer } from "./output/terminal.js";
import { filterServers, loadServers } from "./servers/load.js";
import type { ScanSummary, Server } from "./types.js";

export interface ScanIO {
  out: Writer;
  err: Writer;
  c: Colors;
  signal?: AbortSignal;
}

export async function resolveServers(o: Options): Promise<{ servers: Server[]; source: string }> {
  const loaded = await loadServers({
    ...(o.list ? { list: o.list } : {}),
    add: o.add,
  });
  const servers = filterServers(loaded.servers, {
    provider: o.provider,
    type: o.type,
    ...(o.search ? { search: o.search } : {}),
  });
  const source = loaded.version ? `${loaded.source} v${loaded.version}` : loaded.source;
  return { servers, source };
}

export function diffText(c: Colors, d: ScanDiff): string | undefined {
  if (!d.cameUp.length && !d.wentDown.length) return undefined;
  const parts = [];
  if (d.cameUp.length) parts.push(c.green(`${d.cameUp.length} new up`));
  if (d.wentDown.length) parts.push(c.red(`${d.wentDown.length} went down`));
  return `${parts.join(", ")} since ${relativeTime(d.since)}`;
}

/** File path for one format. A single `--out` is used as-is; with several formats its extension is swapped. */
function outPath(out: string | undefined, format: Format, fileFormats: number): string | undefined {
  if (!out || fileFormats <= 1) return out;
  const ext = extname(out);
  return `${ext ? out.slice(0, -ext.length) : out}.${format}`;
}

const EXT: Record<Exclude<Format, "terminal">, string> = {
  json: "json",
  csv: "csv",
  md: "md",
  html: "html",
};

export function render(format: Exclude<Format, "terminal">, s: ScanSummary, note?: string): string {
  if (format === "json") return toJson(s);
  if (format === "csv") return toCsv(s);
  if (format === "md") return toMarkdown(s);
  return toHtml(s, note ? { note } : {});
}

export interface ScanRun {
  summary: ScanSummary;
  diff?: ScanDiff;
  files: string[];
}

/** One full scan: load → check → history → outputs. */
export async function runScan(
  o: Options,
  io: ScanIO,
  run: { first?: boolean; openReport?: boolean } = {},
): Promise<ScanRun> {
  const { out, err, c } = io;
  const ui = !o.json && !o.quiet;
  const first = run.first ?? true;

  const { servers, source } = await resolveServers(o);
  if (!servers.length) throw new Error("no servers match the given filters");

  if (ui && first) {
    out.write(`${banner(c)}\n`);
    out.write(
      c.dim(
        `Checking ${servers.length} servers (${source}, concurrency ${o.concurrency}, timeout ${o.timeout} ms)\n\n`,
      ),
    );
  }

  const progress = ui ? new Progress(out, c, { verbose: o.verbose }) : undefined;
  const full = await checkServers(servers, {
    concurrency: o.concurrency,
    timeout: o.timeout,
    tcpPrecheck: o.tcpPrecheck,
    ...(progress ? { onResult: (r, d, t) => progress.tick(r, d, t) } : {}),
    ...(io.signal ? { signal: io.signal } : {}),
  });
  progress?.finish();

  const summary: ScanSummary = o.onlyOk
    ? { ...full, results: full.results.filter((r) => r.up) }
    : full;
  const note = ispNote(detectIsp(full.results));

  let diff: ScanDiff | undefined;
  if (o.history) {
    const prev = loadHistory();
    if (prev) diff = diffScans(prev, full.results);
    try {
      saveHistory(full);
    } catch (e) {
      err.write(c.yellow(`warning: could not save history: ${(e as Error).message}\n`));
    }
  }

  if (o.json) {
    out.write(`${toJson(summary)}\n`);
    return { summary, ...(diff ? { diff } : {}), files: [] };
  }

  const files: string[] = [];
  const fileFormats = o.format.filter((f): f is Exclude<Format, "terminal"> => f !== "terminal");
  for (const f of fileFormats) {
    const file = writeReport(
      render(f, summary, note),
      EXT[f],
      outPath(o.out, f, fileFormats.length),
    );
    files.push(file);
  }

  if (!o.quiet && o.format.includes("terminal")) {
    const d = diff ? diffText(c, diff) : undefined;
    out.write(
      `${summaryText(c, summary, { ...(note ? { note } : {}), ...(d ? { diff: d } : {}) })}\n`,
    );
  }
  if (!o.quiet) {
    for (const f of files) out.write(c.dim(`Report: ${f}\n`));
    if (first) out.write(c.dim(`Contributors: ${CONTRIBUTORS_URL}\n`));
  }

  const html = files.find((f) => f.endsWith(".html"));
  if (html && (run.openReport ?? true) && o.open && !o.interactive) {
    const ok = await openTarget(html);
    if (!ok && !o.quiet) err.write(c.dim("(could not open the report automatically)\n"));
  }
  return { summary, ...(diff ? { diff } : {}), files };
}
