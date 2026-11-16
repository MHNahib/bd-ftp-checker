import pc from "picocolors";
import type { CheckResult, ScanSummary } from "../types.js";
import { BANNER } from "./banner.js";

export type Colors = ReturnType<typeof pc.createColors>;

export function makeColors(enabled: boolean = pc.isColorSupported): Colors {
  return pc.createColors(enabled);
}

export interface Writer {
  write(s: string): unknown;
  isTTY?: boolean;
  columns?: number;
}

export function banner(c: Colors): string {
  return `\n${c.cyan(BANNER)}\n`;
}

function statusLabel(r: CheckResult): string {
  return r.httpStatus ? `${r.status} ${r.httpStatus}` : r.status;
}

function fmtLatency(c: Colors, ms: number | undefined): string {
  if (ms === undefined) return "";
  const s = `${ms} ms`;
  if (ms < 100) return c.green(s);
  if (ms < 500) return c.yellow(s);
  return c.red(s);
}

/** One line per result: `✔ name  provider  status  latency`. */
export function resultLine(c: Colors, r: CheckResult): string {
  const icon = r.up ? c.green("✔") : c.red("✖");
  const name = r.up ? r.server.url : c.dim(r.server.url);
  const status = r.up ? c.green(statusLabel(r)) : c.red(statusLabel(r));
  const lat = fmtLatency(c, r.latencyMs);
  return `${icon} ${name} ${c.dim(`[${r.server.provider}]`)} ${status}${lat ? ` ${lat}` : ""}`;
}

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

/** Table of results (reachable only unless `all`). */
export function resultTable(c: Colors, results: CheckResult[], all = false): string {
  const rows = all ? results : results.filter((r) => r.up);
  if (!rows.length) return c.yellow("No reachable servers.");
  const wUrl = Math.min(60, Math.max(6, ...rows.map((r) => r.server.url.length)));
  const wProv = Math.min(20, Math.max(8, ...rows.map((r) => r.server.provider.length)));
  const head = c.dim(
    `  ${pad("SERVER", wUrl)}  ${pad("PROVIDER", wProv)}  ${pad("TYPE", 8)}  ${pad("STATUS", 16)}  LATENCY`,
  );
  const body = rows.map((r) => {
    const url = r.server.url.length > wUrl ? `${r.server.url.slice(0, wUrl - 1)}…` : r.server.url;
    const st = pad(statusLabel(r), 16);
    return `${r.up ? c.green("✔") : c.red("✖")} ${pad(url, wUrl)}  ${pad(r.server.provider.slice(0, wProv), wProv)}  ${pad(r.server.type, 8)}  ${r.up ? c.green(st) : c.red(st)}  ${fmtLatency(c, r.latencyMs)}`;
  });
  return [head, ...body].join("\n");
}

export function summaryText(
  c: Colors,
  s: ScanSummary,
  extra: { note?: string; diff?: string } = {},
): string {
  const secs = (s.durationMs / 1000).toFixed(1);
  const lines = ["", c.bold(`${c.green(String(s.up))}/${s.total} reachable in ${secs}s`)];
  const fastest = s.results.filter((r) => r.up && r.latencyMs !== undefined).slice(0, 5);
  if (fastest.length) {
    lines.push(c.dim("Fastest:"));
    for (const r of fastest) {
      lines.push(
        `  ${fmtLatency(c, r.latencyMs).padEnd(8)} ${r.server.url} ${c.dim(`[${r.server.provider}]`)}`,
      );
    }
  }
  const failures = new Map<string, number>();
  for (const r of s.results) if (!r.up) failures.set(r.status, (failures.get(r.status) ?? 0) + 1);
  if (failures.size) {
    const parts = [...failures.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`);
    lines.push(c.dim(`Down: ${parts.join(", ")}`));
  }
  if (extra.note) lines.push(c.cyan(extra.note));
  if (extra.diff) lines.push(extra.diff);
  return lines.join("\n");
}

/**
 * Live progress. On a TTY it redraws one bar line; elsewhere it prints one line per
 * reachable result (or every result with `verbose`) so CI logs stay readable.
 */
export class Progress {
  private up = 0;
  private lastDraw = 0;
  private readonly t0 = performance.now();

  constructor(
    private readonly out: Writer,
    private readonly c: Colors,
    private readonly opts: { verbose?: boolean } = {},
  ) {}

  private get tty(): boolean {
    return Boolean(this.out.isTTY);
  }

  tick(r: CheckResult, done: number, total: number): void {
    if (r.up) this.up++;
    if (!this.tty) {
      if (r.up || this.opts.verbose) this.out.write(`${resultLine(this.c, r)}\n`);
      return;
    }
    if (r.up || this.opts.verbose) {
      this.clear();
      this.out.write(`${resultLine(this.c, r)}\n`);
    }
    const now = performance.now();
    if (done === total || now - this.lastDraw > 50 || r.up) {
      this.lastDraw = now;
      this.draw(done, total);
    }
  }

  private clear(): void {
    this.out.write("\r\x1b[2K");
  }

  private draw(done: number, total: number): void {
    const width = Math.max(10, Math.min(30, (this.out.columns ?? 80) - 50));
    const ratio = total ? done / total : 1;
    const filled = Math.round(ratio * width);
    const bar = this.c.green("█".repeat(filled)) + this.c.dim("░".repeat(width - filled));
    const secs = ((performance.now() - this.t0) / 1000).toFixed(1);
    this.clear();
    this.out.write(
      `${bar} ${done}/${total} ${this.c.dim("·")} ${this.c.green(`${this.up} up`)} ${this.c.dim(`· ${secs}s`)}`,
    );
  }

  finish(): void {
    if (this.tty) {
      this.clear();
    }
  }
}
