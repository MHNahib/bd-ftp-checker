import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { groupByProvider, toCsv, toJson, toMarkdown } from "../src/output/formats.js";
import { escapeHtml, pruneReports, toHtml, writeReport } from "../src/output/html.js";
import { openCommand } from "../src/output/open.js";
import { makeColors, Progress, resultTable, summaryText } from "../src/output/terminal.js";
import type { CheckResult, ScanSummary } from "../src/types.js";

function result(over: Partial<CheckResult> & { url: string; provider?: string }): CheckResult {
  const { url, provider = "P", ...rest } = over;
  return {
    server: { url, name: new URL(url).host, provider, type: "ftp" },
    status: "ok",
    up: true,
    ...rest,
  };
}

const summary: ScanSummary = {
  startedAt: "2026-11-16T10:00:00.000Z",
  durationMs: 4321,
  total: 3,
  up: 2,
  results: [
    result({ url: "http://a.example", provider: "Alpha", latencyMs: 40, httpStatus: 200 }),
    result({
      url: "http://b.example",
      provider: "Beta",
      latencyMs: 300,
      status: "restricted",
      httpStatus: 403,
    }),
    result({
      url: "http://c.example/<x>",
      provider: 'Ga"mma, Inc',
      up: false,
      status: "timeout",
      error: "timed out",
    }),
  ],
};

const c = makeColors(false);

describe("formats", () => {
  it("json round-trips with flat fields", () => {
    const data = JSON.parse(toJson(summary));
    expect(data.total).toBe(3);
    expect(data.results[0]).toMatchObject({ url: "http://a.example", status: "ok", latencyMs: 40 });
    expect(data.results[2].httpStatus).toBeNull();
  });

  it("csv escapes commas and quotes", () => {
    const lines = toCsv(summary).trim().split("\n");
    expect(lines[0]).toBe("url,name,provider,type,status,up,httpStatus,latencyMs,connectMs,error");
    expect(lines).toHaveLength(4);
    expect(lines[3]).toContain('"Ga""mma, Inc"');
  });

  it("markdown has a row per result", () => {
    const md = toMarkdown(summary);
    expect(md).toContain("2/3 reachable in 4.3s");
    expect(md.match(/^\| (✅|❌) /gm)).toHaveLength(3);
    expect(md).toContain("restricted (403)");
  });

  it("groups providers by up-count", () => {
    const groups = groupByProvider(summary.results).map(([p]) => p);
    expect(groups.at(-1)).toBe('Ga"mma, Inc');
  });
});

describe("html", () => {
  it("escapes", () => {
    expect(escapeHtml(`<a href="x">&'`)).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&#39;");
  });

  it("is self-contained and escapes user data", () => {
    const html = toHtml(summary, { note: "You are probably on <Alpha>" });
    // only external resource: the contributors image (same as the README)
    expect(html).not.toMatch(/<(script|link)[^>]+(src|href)=/);
    expect(html.match(/<img [^>]*src=/g)).toHaveLength(1);
    expect(html).toContain("contrib.rocks/image?repo=MHNahib/bd-ftp-checker");
    expect(html).not.toContain("<x>");
    expect(html).toContain("http://c.example/&lt;x&gt;");
    expect(html).toContain("You are probably on &lt;Alpha&gt;");
    expect(html.match(/<tr data-up=/g)).toHaveLength(3);
    expect(html).not.toContain("M. H. Nahib");
  });

  it("does not link non-http urls", () => {
    const bad = result({ url: "http://ok.example" });
    bad.server.url = "javascript:alert(1)";
    expect(toHtml({ ...summary, results: [bad] })).not.toContain('href="javascript:');
  });
});

describe("report files", () => {
  let dir: string;
  const prev = process.env.BDFTP_HOME;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "bdftp-"));
    process.env.BDFTP_HOME = dir;
  });
  afterEach(() => {
    if (prev === undefined) delete process.env.BDFTP_HOME;
    else process.env.BDFTP_HOME = prev;
  });

  it("writes to reports dir by default", () => {
    const file = writeReport("<html></html>", "html");
    expect(file.startsWith(join(dir, "reports"))).toBe(true);
    expect(readFileSync(file, "utf8")).toBe("<html></html>");
  });

  it("writes to --out path", () => {
    const out = join(dir, "nested", "r.html");
    expect(writeReport("x", "html", out)).toBe(out);
  });

  it("prunes old reports", () => {
    const rdir = join(dir, "r");
    writeReport("x", "html", join(rdir, "keep.txt"));
    for (let i = 10; i < 35; i++) writeFileSync(join(rdir, `report-202611${i}-000000.html`), "");
    pruneReports(rdir, 20);
    const left = readdirSync(rdir);
    expect(left.filter((f) => f.startsWith("report-"))).toHaveLength(20);
    expect(left).toContain("keep.txt");
    expect(left).not.toContain("report-20261110-000000.html");
  });
});

describe("open", () => {
  it("picks per-platform command", () => {
    expect(openCommand("f.html", "darwin")).toEqual(["open", ["f.html"]]);
    expect(openCommand("f.html", "linux")).toEqual(["xdg-open", ["f.html"]]);
    expect(openCommand("a&b", "win32")[1]).toEqual(["/c", "start", '""', "a^&b"]);
  });
});

describe("terminal", () => {
  it("summary lists counts, fastest and failure reasons", () => {
    const text = summaryText(c, summary, { note: "ISP" });
    expect(text).toContain("2/3 reachable in 4.3s");
    expect(text).toContain("40 ms");
    expect(text).toContain("Down: timeout 1");
    expect(text).toContain("ISP");
  });

  it("table shows only reachable by default", () => {
    expect(resultTable(c, summary.results).split("\n")).toHaveLength(3);
    expect(resultTable(c, summary.results, true).split("\n")).toHaveLength(4);
  });

  it("progress prints lines on non-tty", () => {
    let out = "";
    const p = new Progress({ write: (s: string) => (out += s), isTTY: false }, c);
    for (const [i, r] of summary.results.entries()) p.tick(r, i + 1, 3);
    p.finish();
    expect(out.trim().split("\n")).toHaveLength(2);
    expect(out).not.toContain("\x1b");
  });

  it("progress draws a bar on tty", () => {
    let out = "";
    const p = new Progress({ write: (s: string) => (out += s), isTTY: true, columns: 100 }, c);
    for (const [i, r] of summary.results.entries()) p.tick(r, i + 1, 3);
    expect(out).toContain("3/3");
    expect(out).toContain("2 up");
  });
});
