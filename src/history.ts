import { readFileSync, writeFileSync } from "node:fs";
import { ensureDir, paths } from "./paths.js";
import type { CheckResult, ScanSummary } from "./types.js";

export interface HistoryEntry {
  startedAt: string;
  up: string[];
  checked: string[];
}

export interface ScanDiff {
  cameUp: string[];
  wentDown: string[];
  since: string;
}

export function toHistory(summary: ScanSummary): HistoryEntry {
  return {
    startedAt: summary.startedAt,
    up: summary.results.filter((r) => r.up).map((r) => r.server.url),
    checked: summary.results.map((r) => r.server.url),
  };
}

export function loadHistory(): HistoryEntry | undefined {
  try {
    const data = JSON.parse(readFileSync(paths.history, "utf8")) as HistoryEntry;
    return Array.isArray(data.up) && Array.isArray(data.checked) ? data : undefined;
  } catch {
    return undefined;
  }
}

export function saveHistory(summary: ScanSummary): void {
  ensureDir(paths.root);
  writeFileSync(paths.history, `${JSON.stringify(toHistory(summary))}\n`);
}

/** Compare only servers checked in both runs (filters may differ between runs). */
export function diffScans(prev: HistoryEntry, results: CheckResult[]): ScanDiff {
  const prevUp = new Set(prev.up);
  const prevChecked = new Set(prev.checked);
  const cameUp: string[] = [];
  const wentDown: string[] = [];
  for (const r of results) {
    const url = r.server.url;
    if (!prevChecked.has(url)) continue;
    if (r.up && !prevUp.has(url)) cameUp.push(url);
    if (!r.up && prevUp.has(url)) wentDown.push(url);
  }
  return { cameUp, wentDown, since: prev.startedAt };
}

export function relativeTime(iso: string, now = Date.now()): string {
  const secs = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
