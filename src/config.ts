import { readFileSync } from "node:fs";
import { DEFAULTS } from "./core/checker.js";
import { FORMATS, type Format } from "./output/formats.js";
import { paths } from "./paths.js";

export interface Options {
  concurrency: number;
  timeout: number;
  tcpPrecheck: boolean;
  provider: string[];
  type: string[];
  search?: string;
  onlyOk: boolean;
  format: Format[];
  json: boolean;
  open: boolean;
  out?: string;
  quiet: boolean;
  verbose: boolean;
  color: boolean;
  list?: string;
  add: string[];
  /** minutes between scans; undefined = no watch */
  watch?: number;
  interactive: boolean;
  history: boolean;
  notify: boolean;
}

export function defaultOptions(): Options {
  return {
    concurrency: DEFAULTS.concurrency,
    timeout: DEFAULTS.timeout,
    tcpPrecheck: DEFAULTS.tcpPrecheck,
    provider: [],
    type: [],
    onlyOk: false,
    format: ["terminal", "html"],
    json: false,
    open: true,
    quiet: false,
    verbose: false,
    color: true,
    add: [],
    interactive: false,
    history: true,
    notify: true,
  };
}

const KEYS = Object.keys(defaultOptions()).concat(["search", "out", "list", "watch"]);

/** Read ~/.bdftprc (or `file`). Missing default file → {}; missing explicit file → throws. */
export function readConfigFile(file?: string): Partial<Options> {
  const target = file ?? paths.rc;
  let text: string;
  try {
    text = readFileSync(target, "utf8");
  } catch (err) {
    if (file) throw new Error(`cannot read config ${file}: ${(err as Error).message}`);
    return {};
  }
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (err) {
    throw new Error(`invalid JSON in ${target}: ${(err as Error).message}`);
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error(`${target} must contain a JSON object`);
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (KEYS.includes(k)) out[k] = v;
  }
  return out as Partial<Options>;
}

const toArray = (v: unknown): string[] =>
  v === undefined ? [] : (Array.isArray(v) ? v : [v]).map(String);

/** defaults ← config file ← CLI (only keys the user actually passed). */
export function mergeOptions(
  file: Partial<Options>,
  cli: Partial<Options>,
  base: Options = defaultOptions(),
): Options {
  const merged = { ...base } as Record<string, unknown>;
  for (const src of [file, cli]) {
    for (const [k, v] of Object.entries(src)) if (v !== undefined) merged[k] = v;
  }
  const o = merged as unknown as Options;
  o.provider = toArray(o.provider);
  o.type = toArray(o.type);
  o.add = toArray(o.add);
  o.format = toArray(o.format) as Format[];
  return validateOptions(o);
}

export function validateOptions(o: Options): Options {
  const int = (name: string, v: unknown, min: number, max: number) => {
    const n = Number(v);
    if (!Number.isInteger(n) || n < min || n > max) {
      throw new Error(`--${name} must be an integer between ${min} and ${max}`);
    }
    return n;
  };
  o.concurrency = int("concurrency", o.concurrency, 1, 1024);
  o.timeout = int("timeout", o.timeout, 100, 120_000);
  if (o.watch !== undefined) {
    const w = Number(o.watch);
    if (!Number.isFinite(w) || w <= 0)
      throw new Error("--watch must be a positive number of minutes");
    o.watch = w;
  }
  for (const f of o.format) {
    if (!(FORMATS as readonly string[]).includes(f)) {
      throw new Error(`unknown format "${f}" (use: ${FORMATS.join(", ")})`);
    }
  }
  o.format = [...new Set(o.format)];
  return o;
}
