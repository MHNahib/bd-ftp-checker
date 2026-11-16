import { mkdtempSync, writeFileSync } from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { normalizeArgv, parseCli } from "../src/cli.js";
import { defaultOptions, mergeOptions, readConfigFile } from "../src/config.js";
import { detectIsp, isPrivateIPv4 } from "../src/core/detect.js";
import { extractLinks, findMediaFile, speedTest } from "../src/core/speedtest.js";
import { diffScans, relativeTime, toHistory } from "../src/history.js";
import { notifyCommand } from "../src/output/notify.js";
import type { CheckResult, ScanSummary } from "../src/types.js";

function r(url: string, provider: string, up: boolean, address?: string): CheckResult {
  return {
    server: { url, name: url, provider, type: "ftp" },
    status: up ? "ok" : "timeout",
    up,
    ...(address ? { address } : {}),
  };
}

describe("config", () => {
  it("cli wins over file, file over defaults", () => {
    const o = mergeOptions({ timeout: 5000, concurrency: 10 }, { concurrency: 20 });
    expect(o.timeout).toBe(5000);
    expect(o.concurrency).toBe(20);
    expect(o.format).toEqual(defaultOptions().format);
  });

  it("validates values", () => {
    expect(() => mergeOptions({}, { concurrency: 0 })).toThrow(/concurrency/);
    expect(() => mergeOptions({}, { timeout: Number.NaN })).toThrow(/timeout/);
    expect(() => mergeOptions({}, { format: ["pdf" as never] })).toThrow(/format/);
    expect(() => mergeOptions({}, { watch: -1 })).toThrow(/watch/);
  });

  it("reads rc file, ignores unknown keys, errors on bad JSON", () => {
    const dir = mkdtempSync(join(tmpdir(), "bdftp-rc-"));
    const good = join(dir, "good.json");
    writeFileSync(good, JSON.stringify({ timeout: 1234, bogus: 1, provider: "ftpbd" }));
    const rc = readConfigFile(good);
    expect(rc).toEqual({ timeout: 1234, provider: "ftpbd" });
    expect(mergeOptions(rc, {}).provider).toEqual(["ftpbd"]);
    const bad = join(dir, "bad.json");
    writeFileSync(bad, "{nope");
    expect(() => readConfigFile(bad)).toThrow(/invalid JSON/);
    expect(() => readConfigFile(join(dir, "missing.json"))).toThrow(/cannot read/);
  });
});

describe("cli parsing", () => {
  it("watch takes an optional value", () => {
    expect(normalizeArgv(["-w"])).toEqual(["-w", "5"]);
    expect(normalizeArgv(["--watch", "2", "-q"])).toEqual(["--watch", "2", "-q"]);
    expect(normalizeArgv(["--watch", "--json"])).toEqual(["--watch", "5", "--json"]);
  });

  it("maps flags to options", () => {
    const { command, cli } = parseCli([
      "-p",
      "ftpbd",
      "-p",
      "circle",
      "-f",
      "json,csv",
      "--no-open",
      "--no-tcp-precheck",
      "-c",
      "8",
    ]);
    expect(command).toBe("scan");
    expect(cli).toMatchObject({
      provider: ["ftpbd", "circle"],
      format: ["json", "csv"],
      open: false,
      tcpPrecheck: false,
      concurrency: 8,
    });
  });

  it("parses commands and rejects unknown ones", () => {
    expect(parseCli(["speedtest", "http://x/a.mkv"]).rest).toEqual(["http://x/a.mkv"]);
    expect(parseCli(["list", "--type", "emby"]).command).toBe("list");
    expect(() => parseCli(["frobnicate"])).toThrow(/unknown command/);
    expect(() => parseCli(["--nope"])).toThrow();
  });
});

describe("history", () => {
  const prevSummary: ScanSummary = {
    startedAt: new Date(Date.now() - 120_000).toISOString(),
    durationMs: 1,
    total: 3,
    up: 1,
    results: [r("http://a", "A", true), r("http://b", "A", false), r("http://c", "B", false)],
  };

  it("diffs only servers checked in both runs", () => {
    const prev = toHistory(prevSummary);
    const d = diffScans(prev, [
      r("http://a", "A", false),
      r("http://b", "A", true),
      r("http://new", "A", true),
    ]);
    expect(d.cameUp).toEqual(["http://b"]);
    expect(d.wentDown).toEqual(["http://a"]);
  });

  it("formats relative time", () => {
    const now = Date.parse("2026-11-16T12:00:00Z");
    expect(relativeTime("2026-11-16T11:59:30Z", now)).toBe("30s ago");
    expect(relativeTime("2026-11-16T11:00:00Z", now)).toBe("1h ago");
    expect(relativeTime("2026-11-14T12:00:00Z", now)).toBe("2d ago");
  });
});

describe("isp detection", () => {
  it("recognises private ranges", () => {
    expect(isPrivateIPv4("10.1.2.3")).toBe(true);
    expect(isPrivateIPv4("172.20.0.1")).toBe(true);
    expect(isPrivateIPv4("172.32.0.1")).toBe(false);
    expect(isPrivateIPv4("192.168.1.1")).toBe(true);
    expect(isPrivateIPv4("100.70.0.1")).toBe(true);
    expect(isPrivateIPv4("103.58.73.9")).toBe(false);
    expect(isPrivateIPv4("example.com")).toBe(false);
  });

  it("private reachable server wins with high confidence", () => {
    const g = detectIsp([
      r("http://10.16.100.244", "ICC", true),
      r("http://x.circle.net", "Circle", true),
      r("http://y.circle.net", "Circle", true),
      r("http://media.ftpbd.net", "FTPBD", true, "172.16.50.4"),
      r("http://media2.ftpbd.net", "FTPBD", true, "::ffff:172.16.50.5"),
    ]);
    expect(g).toMatchObject({ provider: "FTPBD", confidence: "high" });
  });

  it("falls back to reachable ratio, ignores Custom, gives up when unclear", () => {
    const g = detectIsp([
      r("http://a1", "A", true),
      r("http://a2", "A", true),
      r("http://b1", "B", false),
      r("http://b2", "B", true),
      r("http://b3", "B", false),
      r("http://c", "Custom", true),
    ]);
    expect(g).toMatchObject({ provider: "A", confidence: "medium" });
    expect(
      detectIsp([
        r("http://a1", "A", true),
        r("http://a2", "A", false),
        r("http://b1", "B", true),
        r("http://b2", "B", false),
      ]),
    ).toBeUndefined();
  });
});

describe("notify", () => {
  it("builds per-OS commands without interpolating text", () => {
    const evil = `"; rm -rf / #'$(x)`;
    const win = notifyCommand("t", evil, "win32");
    expect(win?.cmd).toBe("powershell.exe");
    expect(win?.args.join(" ")).not.toContain("rm -rf");
    expect(win?.env?.BDFTP_BODY).toBe(evil);
    expect(notifyCommand("t", evil, "darwin")?.args.slice(-2)).toEqual(["t", evil]);
    expect(notifyCommand("t", "b", "linux")?.cmd).toBe("notify-send");
    expect(notifyCommand("t", "b", "aix")).toBeUndefined();
  });
});

describe("speedtest", () => {
  let server: http.Server;
  let base: string;
  beforeAll(async () => {
    server = http.createServer((req, res) => {
      const url = req.url ?? "/";
      const html = (links: string[]) => {
        res.writeHead(200, { "content-type": "text/html" });
        res.end(links.map((l) => `<a href="${l}">${l}</a>`).join("\n"));
      };
      if (url === "/") return html(["../", "?C=N;O=D", "Movies/", "http://elsewhere.test/x.mkv"]);
      if (url === "/Movies/") return html(["../", "2024/", "readme.txt"]);
      if (url === "/Movies/2024/") return html(["Some%20Film.mkv"]);
      if (url === "/Movies/2024/Some%20Film.mkv") {
        res.writeHead(200, { "content-type": "video/x-matroska" });
        res.end(Buffer.alloc(512 * 1024));
        return;
      }
      if (url === "/redir") {
        res.writeHead(302, { location: "/Movies/2024/Some%20Film.mkv" }).end();
        return;
      }
      res.writeHead(404).end();
    });
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((done) => server.close(() => done())));

  it("extracts same-host descending links", () => {
    const links = extractLinks(
      `<a href="../">up</a><a href="sub/">s</a><a href='f.mkv'>f</a><a href="?sort">x</a><a href="http://other/y">o</a>`,
      "http://h/dir/",
    );
    expect(links).toEqual(["http://h/dir/sub/", "http://h/dir/f.mkv"]);
  });

  it("finds a media file within depth 2", async () => {
    expect(await findMediaFile(base)).toBe(`${base}/Movies/2024/Some%20Film.mkv`);
    expect(await findMediaFile(base, { depth: 1 })).toBeUndefined();
  });

  it("measures download through redirects", async () => {
    const res = await speedTest(`${base}/redir`, { seconds: 2 });
    expect(res.bytes).toBe(512 * 1024);
    expect(res.MBps).toBeGreaterThan(0);
    expect(res.Mbps).toBeCloseTo(res.MBps * 8);
  });
});
