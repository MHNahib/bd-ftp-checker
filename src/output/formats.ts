import type { CheckResult, ScanSummary } from "../types.js";

export const FORMATS = ["terminal", "json", "csv", "md", "html"] as const;
export type Format = (typeof FORMATS)[number];

/** Flat, serialisable view of a result. */
export function flatten(r: CheckResult) {
  return {
    url: r.server.url,
    name: r.server.name,
    provider: r.server.provider,
    type: r.server.type,
    status: r.status,
    up: r.up,
    httpStatus: r.httpStatus ?? null,
    latencyMs: r.latencyMs ?? null,
    connectMs: r.connectMs ?? null,
    method: r.method ?? null,
    finalUrl: r.finalUrl ?? null,
    error: r.error ?? null,
  };
}

export function toJson(summary: ScanSummary, pretty = true): string {
  const data = {
    startedAt: summary.startedAt,
    durationMs: summary.durationMs,
    total: summary.total,
    up: summary.up,
    results: summary.results.map(flatten),
  };
  return JSON.stringify(data, null, pretty ? 2 : 0);
}

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const CSV_COLUMNS = [
  "url",
  "name",
  "provider",
  "type",
  "status",
  "up",
  "httpStatus",
  "latencyMs",
  "connectMs",
  "error",
] as const;

export function toCsv(summary: ScanSummary): string {
  const rows = summary.results.map((r) => {
    const f = flatten(r);
    return CSV_COLUMNS.map((c) => csvCell(f[c])).join(",");
  });
  return `${[CSV_COLUMNS.join(","), ...rows].join("\n")}\n`;
}

function mdCell(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

export function toMarkdown(summary: ScanSummary): string {
  const lines = [
    "# BD FTP Checker results",
    "",
    `${summary.up}/${summary.total} reachable in ${(summary.durationMs / 1000).toFixed(1)}s (${summary.startedAt})`,
    "",
    "| | Server | Provider | Type | Status | Latency |",
    "|---|---|---|---|---|---:|",
  ];
  for (const r of summary.results) {
    const status = r.httpStatus ? `${r.status} (${r.httpStatus})` : r.status;
    const latency = r.latencyMs !== undefined ? `${r.latencyMs} ms` : "";
    lines.push(
      `| ${r.up ? "✅" : "❌"} | [${mdCell(r.server.name)}](${r.server.url}) | ${mdCell(r.server.provider)} | ${r.server.type} | ${status} | ${latency} |`,
    );
  }
  return `${lines.join("\n")}\n`;
}

/** Group results by provider, providers ordered by up-count desc then name. */
export function groupByProvider(results: CheckResult[]): [string, CheckResult[]][] {
  const map = new Map<string, CheckResult[]>();
  for (const r of results) {
    const list = map.get(r.server.provider) ?? [];
    list.push(r);
    map.set(r.server.provider, list);
  }
  const upCount = (l: CheckResult[]) => l.filter((r) => r.up).length;
  return [...map.entries()].sort(
    ([a, la], [b, lb]) => upCount(lb) - upCount(la) || a.localeCompare(b),
  );
}
