#!/usr/bin/env node
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { mergeOptions, type Options, readConfigFile } from "./config.js";
import { findMediaFile, speedTest } from "./core/speedtest.js";
import { banner, type Colors, makeColors, type Writer } from "./output/terminal.js";
import { resolveServers, runScan, type ScanIO } from "./scan.js";
import { updateServerList } from "./servers/update.js";
import { SERVER_TYPES } from "./types.js";

const COMMANDS = ["scan", "update", "speedtest", "list", "help"] as const;
type Command = (typeof COMMANDS)[number];

function version(): string {
  try {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
      version: string;
    };
    return pkg.version;
  } catch {
    return "unknown";
  }
}

const HELP = `Usage: bd-ftp-checker [command] [options]

Commands:
  scan (default)          check which servers are reachable
  list                    print the server list (filters apply) without checking
  update                  download the latest server list from GitHub
  speedtest [url]         download speed test (no url: auto-pick a fast server)

Scan options:
  -c, --concurrency <n>   parallel checks (default 256)
  -t, --timeout <ms>      per-server timeout (default 3000)
      --no-tcp-precheck   skip the raw TCP connect before HTTP
  -p, --provider <name>   only this provider (repeatable, substring match)
      --type <type>       only this type: ${SERVER_TYPES.join(", ")} (repeatable)
  -s, --search <text>     only servers whose url/name/provider contains text
      --only-ok           keep only reachable servers in the output
  -f, --format <fmt>      terminal, json, csv, md, html (repeatable; default terminal+html)
      --json              print JSON to stdout only (for piping)
  -o, --out <path>        report file path (default ~/.bd-ftp-checker/reports/)
      --no-open           do not open the HTML report
  -q, --quiet             no banner, progress or summary
  -v, --verbose           also print unreachable servers while scanning
      --no-color          disable colors
  -l, --list <file>       custom server list (txt: one url per line, or JSON)
  -a, --add <url>         add a server (repeatable)
  -w, --watch [min]       re-scan every N minutes (default 5) and notify on changes
      --no-notify         no desktop notifications in watch mode
  -i, --interactive       pick reachable servers to open after the scan
      --no-history        do not compare with / save the last run
      --config <file>     config file (default ~/.bdftprc, JSON with any option)

Speedtest options:
      --seconds <n>       download duration (default 10)

  -h, --help              show help
  -V, --version           show version
`;

const OPTIONS = {
  concurrency: { type: "string", short: "c" },
  timeout: { type: "string", short: "t" },
  "tcp-precheck": { type: "boolean" },
  "no-tcp-precheck": { type: "boolean" },
  provider: { type: "string", short: "p", multiple: true },
  type: { type: "string", multiple: true },
  search: { type: "string", short: "s" },
  "only-ok": { type: "boolean" },
  format: { type: "string", short: "f", multiple: true },
  json: { type: "boolean" },
  out: { type: "string", short: "o" },
  "no-open": { type: "boolean" },
  quiet: { type: "boolean", short: "q" },
  verbose: { type: "boolean", short: "v" },
  "no-color": { type: "boolean" },
  list: { type: "string", short: "l" },
  add: { type: "string", short: "a", multiple: true },
  watch: { type: "string", short: "w" },
  "no-notify": { type: "boolean" },
  interactive: { type: "boolean", short: "i" },
  "no-history": { type: "boolean" },
  config: { type: "string" },
  seconds: { type: "string" },
  help: { type: "boolean", short: "h" },
  version: { type: "boolean", short: "V" },
} as const;

/** `-w`/`--watch` take an optional value; parseArgs needs one, so insert the default. */
export function normalizeArgv(argv: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] as string;
    out.push(a);
    if (a === "-w" || a === "--watch") {
      const next = argv[i + 1];
      if (next === undefined || !/^\d+(\.\d+)?$/.test(next)) out.push("5");
    }
  }
  return out;
}

export function parseCli(argv: string[]) {
  const { values, positionals } = parseArgs({
    args: normalizeArgv(argv),
    options: OPTIONS,
    allowPositionals: true,
    strict: true,
  });
  const first = positionals[0];
  let command: Command = "scan";
  let rest = positionals;
  if (first && (COMMANDS as readonly string[]).includes(first)) {
    command = first as Command;
    rest = positionals.slice(1);
  } else if (first) {
    throw new Error(`unknown command "${first}" (see --help)`);
  }

  const cli: Partial<Options> = {
    ...(values.concurrency !== undefined ? { concurrency: Number(values.concurrency) } : {}),
    ...(values.timeout !== undefined ? { timeout: Number(values.timeout) } : {}),
    ...(values["tcp-precheck"] ? { tcpPrecheck: true } : {}),
    ...(values["no-tcp-precheck"] ? { tcpPrecheck: false } : {}),
    ...(values.provider ? { provider: values.provider } : {}),
    ...(values.type ? { type: values.type } : {}),
    ...(values.search !== undefined ? { search: values.search } : {}),
    ...(values["only-ok"] ? { onlyOk: true } : {}),
    ...(values.format
      ? { format: values.format.flatMap((f) => f.split(",")) as Options["format"] }
      : {}),
    ...(values.json ? { json: true } : {}),
    ...(values.out !== undefined ? { out: values.out } : {}),
    ...(values["no-open"] ? { open: false } : {}),
    ...(values.quiet ? { quiet: true } : {}),
    ...(values.verbose ? { verbose: true } : {}),
    ...(values["no-color"] ? { color: false } : {}),
    ...(values.list !== undefined ? { list: values.list } : {}),
    ...(values.add ? { add: values.add } : {}),
    ...(values.watch !== undefined ? { watch: Number(values.watch) } : {}),
    ...(values["no-notify"] ? { notify: false } : {}),
    ...(values.interactive ? { interactive: true } : {}),
    ...(values["no-history"] ? { history: false } : {}),
  };
  return { command, rest, values, cli };
}

async function cmdList(o: Options, out: Writer, c: Colors): Promise<void> {
  const { servers, source } = await resolveServers(o);
  if (o.json) {
    out.write(`${JSON.stringify(servers, null, 2)}\n`);
    return;
  }
  let provider = "";
  for (const s of [...servers].sort((a, b) => a.provider.localeCompare(b.provider))) {
    if (s.provider !== provider) {
      provider = s.provider;
      out.write(`\n${c.bold(provider)}\n`);
    }
    out.write(`  ${s.url} ${c.dim(s.type)}\n`);
  }
  out.write(c.dim(`\n${servers.length} servers (${source})\n`));
}

async function cmdUpdate(out: Writer, c: Colors): Promise<void> {
  out.write("Downloading server list…\n");
  const r = await updateServerList();
  out.write(
    r.updated
      ? c.green(`Updated ${r.previousVersion} → ${r.version} (${r.count} servers)\n`)
      : `Already up to date (v${r.version}, ${r.count} servers)\n`,
  );
}

async function cmdSpeedtest(
  o: Options,
  url: string | undefined,
  seconds: number,
  io: ScanIO,
): Promise<void> {
  const { out, c } = io;
  let target = url;
  if (!target) {
    out.write(c.dim("No URL given — scanning for the fastest servers…\n"));
    const run = await runScan(
      { ...o, quiet: true, format: [], history: false, interactive: false },
      io,
      { openReport: false },
    );
    // Directory-listing servers first: ISP homepages ("web") rarely link media files.
    const ok = run.summary.results.filter((r) => r.status === "ok");
    const listing = ok.filter((r) => r.server.type === "ftp" || r.server.type === "h5ai");
    const fastest = [...listing, ...ok.filter((r) => !listing.includes(r))].slice(0, 5);
    if (!fastest.length) throw new Error("no reachable servers to test");
    for (const r of fastest) {
      out.write(c.dim(`Looking for a media file on ${r.server.url}…\n`));
      target = await findMediaFile(r.finalUrl ?? r.server.url, { timeoutMs: o.timeout * 2 });
      if (target) break;
    }
    if (!target)
      throw new Error("no downloadable media file found on the fastest servers; pass a URL");
  }
  out.write(`Testing ${target} for ${seconds}s…\n`);
  const tty = Boolean(out.isTTY);
  const res = await speedTest(target, {
    seconds,
    timeoutMs: Math.max(o.timeout, 5000),
    onProgress: tty
      ? (bytes, secs) =>
          out.write(`\r\x1b[2K${(bytes / 1e6 / Math.max(secs, 0.001)).toFixed(2)} MB/s`)
      : undefined,
  });
  if (tty) out.write("\r\x1b[2K");
  out.write(
    `${c.green(c.bold(`${res.MBps.toFixed(2)} MB/s`))} (${res.Mbps.toFixed(1)} Mbit/s) — ${(res.bytes / 1e6).toFixed(1)} MB in ${res.seconds.toFixed(1)}s\n`,
  );
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  const out: Writer = process.stdout;
  const err: Writer = process.stderr;
  let c = makeColors();

  try {
    const { command, rest, values, cli } = parseCli(argv);
    if (values.version) {
      out.write(`${version()}\n`);
      return 0;
    }
    if (values.help || command === "help") {
      out.write(`${banner(c)}\n${HELP}`);
      return 0;
    }
    const o = mergeOptions(readConfigFile(values.config), cli);
    c = makeColors(o.color && !o.json && makeColors().isColorSupported);

    const ac = new AbortController();
    const onSig = () => {
      if (ac.signal.aborted) process.exit(130);
      ac.abort();
    };
    process.on("SIGINT", onSig);
    const io: ScanIO = { out, err, c, signal: ac.signal };

    try {
      switch (command) {
        case "list":
          await cmdList(o, out, c);
          break;
        case "update":
          await cmdUpdate(out, c);
          break;
        case "speedtest": {
          const seconds = Number(values.seconds ?? 10);
          if (!(seconds > 0 && seconds <= 120))
            throw new Error("--seconds must be between 1 and 120");
          await cmdSpeedtest(o, rest[0], seconds, io);
          break;
        }
        default:
          if (o.watch !== undefined) {
            const { watch } = await import("./watch.js");
            await watch(o, io);
          } else {
            const run = await runScan(o, io);
            if (o.interactive && process.stdin.isTTY && !o.json) {
              const { pickAndOpen } = await import("./interactive.js");
              await pickAndOpen(run.summary.results);
            }
          }
      }
    } finally {
      process.off("SIGINT", onSig);
    }
    return 0;
  } catch (e) {
    err.write(`${c.red("error:")} ${(e as Error).message}\n`);
    return 1;
  }
}

/**
 * dns.lookup runs on the libuv threadpool (4 threads by default). With hundreds of hosts,
 * slow/dead DNS names starve it: lookups queue past the timeout (false "down") and pending
 * ones delay exit by ~10 s. The pool is created at startup (the ESM loader uses it), so the
 * size can only be set from outside: re-run once with UV_THREADPOOL_SIZE when it is unset.
 */
function relaunchWithThreadpool(): boolean {
  if (process.env.UV_THREADPOOL_SIZE || process.env.BDFTP_NO_RELAUNCH) return false;
  const child = spawn(process.execPath, [...process.execArgv, ...process.argv.slice(1)], {
    stdio: "inherit",
    env: { ...process.env, UV_THREADPOOL_SIZE: "64" },
  });
  // Ctrl+C reaches the child directly (same process group / console); just wait for it.
  const ignore = () => {};
  process.on("SIGINT", ignore);
  process.on("SIGTERM", ignore);
  child.once("error", (e) => {
    process.stderr.write(`error: ${e.message}
`);
    process.exit(1);
  });
  child.once("exit", (code, signal) => {
    process.exit(code ?? (signal ? 130 : 1));
  });
  return true;
}

const invoked = process.argv[1] ?? "";
const isEntry = /(?:cli\.(?:js|ts)|bd-ftp-checker)$/.test(invoked.replace(/\\/g, "/"));
if (isEntry && !relaunchWithThreadpool()) {
  main().then((code) => {
    process.exitCode = code;
  });
}
