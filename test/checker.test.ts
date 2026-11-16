import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { checkServers, sortResults } from "../src/core/checker.js";
import { createDnsCache } from "../src/core/dns.js";
import { classifyError } from "../src/core/errors.js";
import { mapPool } from "../src/core/pool.js";
import { statusFromHttp } from "../src/core/probe.js";
import type { CheckResult } from "../src/types.js";
import { closedPort, type MockServer, srv, startMockServer } from "./helpers.js";

let mock: MockServer;
beforeAll(async () => {
  mock = await startMockServer();
});
afterAll(async () => {
  await mock.close();
});

async function checkOne(path: string, opts = {}) {
  const { results } = await checkServers([srv(`${mock.base}${path}`)], { timeout: 800, ...opts });
  return results[0] as CheckResult;
}

describe.each([true, false])("probe (tcpPrecheck=%s)", (tcpPrecheck) => {
  it("200 -> ok via HEAD with latency", async () => {
    const r = await checkOne("/ok", { tcpPrecheck });
    expect(r).toMatchObject({ status: "ok", up: true, httpStatus: 200, method: "HEAD" });
    expect(r.latencyMs).toBeTypeOf("number");
  });

  it("405 on HEAD -> falls back to ranged GET", async () => {
    const r = await checkOne("/head405", { tcpPrecheck });
    expect(r).toMatchObject({ status: "ok", httpStatus: 206, method: "GET" });
  });

  it("follows redirects", async () => {
    const r = await checkOne("/redirect", { tcpPrecheck });
    expect(r).toMatchObject({ status: "ok", httpStatus: 200 });
    expect(r.finalUrl).toBe(`${mock.base}/ok`);
  });

  it("redirect loop stops at maxRedirects and counts as up", async () => {
    const r = await checkOne("/loop", { tcpPrecheck, maxRedirects: 2 });
    expect(r).toMatchObject({ status: "ok", httpStatus: 302 });
  });

  it("403 -> restricted (still up)", async () => {
    const r = await checkOne("/forbidden", { tcpPrecheck });
    expect(r).toMatchObject({ status: "restricted", up: true, httpStatus: 403 });
  });

  it("500 -> http_error", async () => {
    const r = await checkOne("/broken", { tcpPrecheck });
    expect(r).toMatchObject({ status: "http_error", up: false, httpStatus: 500 });
  });

  it("HEAD connection drop -> GET fallback", async () => {
    const r = await checkOne("/drop-head", { tcpPrecheck });
    expect(r).toMatchObject({ status: "ok", method: "GET" });
  });

  it("hanging server -> timeout", async () => {
    const t = performance.now();
    const r = await checkOne("/hang", { tcpPrecheck, timeout: 300 });
    expect(r.status).toBe("timeout");
    expect(performance.now() - t).toBeLessThan(2000);
  });

  it("GET that ignores Range is cut off, not downloaded", async () => {
    const t = performance.now();
    const r = await checkOne("/big", { tcpPrecheck });
    expect(r).toMatchObject({ status: "ok", method: "GET", httpStatus: 200 });
    expect(performance.now() - t).toBeLessThan(500);
  });

  it("closed port -> refused", async () => {
    const port = await closedPort();
    const { results } = await checkServers([srv(`http://127.0.0.1:${port}`)], {
      timeout: 800,
      tcpPrecheck,
    });
    expect(results[0]?.status).toBe("refused");
  });
});

it("unresolvable host -> dns", async () => {
  const { results } = await checkServers([srv("http://does-not-exist.invalid")], { timeout: 2000 });
  expect(results[0]?.status).toBe("dns");
});

it("checks many servers with a concurrency limit and reports progress", async () => {
  const servers = Array.from({ length: 30 }, (_, i) => srv(`${mock.base}/ok?i=${i}`));
  const seen: number[] = [];
  const summary = await checkServers(servers, {
    concurrency: 5,
    timeout: 1000,
    onResult: (_r, done) => seen.push(done),
  });
  expect(summary.total).toBe(30);
  expect(summary.up).toBe(30);
  expect(seen).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
});

describe("mapPool", () => {
  it("never exceeds the limit and keeps order", async () => {
    let active = 0;
    let peak = 0;
    const out = await mapPool([1, 2, 3, 4, 5, 6, 7, 8], 3, async (n) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 10));
      active--;
      return n * 2;
    });
    expect(peak).toBe(3);
    expect(out).toEqual([2, 4, 6, 8, 10, 12, 14, 16]);
  });

  it("stops scheduling after abort", async () => {
    const ac = new AbortController();
    let ran = 0;
    await mapPool(
      [1, 2, 3, 4, 5],
      1,
      async () => {
        ran++;
        ac.abort();
      },
      ac.signal,
    );
    expect(ran).toBe(1);
  });
});

describe("dns cache", () => {
  it("resolves each hostname once, including failures", async () => {
    let calls = 0;
    const fake = ((host: string, _o: unknown, cb: (e: Error | null, a?: unknown) => void) => {
      calls++;
      if (host === "bad") cb(Object.assign(new Error("nope"), { code: "ENOTFOUND" }));
      else cb(null, [{ address: "10.0.0.1", family: 4 }]);
    }) as never;
    const cache = createDnsCache(fake);
    const lookup = (h: string, all = false) =>
      new Promise((res, rej) => cache.lookup(h, { all }, (e, a) => (e ? rej(e) : res(a))));
    expect(await lookup("a")).toBe("10.0.0.1");
    expect(await lookup("a", true)).toEqual([{ address: "10.0.0.1", family: 4 }]);
    await expect(lookup("bad")).rejects.toMatchObject({ code: "ENOTFOUND" });
    await expect(lookup("bad")).rejects.toMatchObject({ code: "ENOTFOUND" });
    expect(calls).toBe(2);
  });
});

describe("classification", () => {
  it.each([
    [{ code: "ECONNREFUSED" }, "refused"],
    [{ code: "ENOTFOUND" }, "dns"],
    [{ code: "EHOSTUNREACH" }, "unreachable"],
    [{ code: "ECONNRESET" }, "reset"],
    [{ name: "TimeoutError" }, "timeout"],
    [{ code: "ERR_SSL_WRONG_VERSION_NUMBER" }, "tls"],
    [{ message: "socket hang up" }, "reset"],
    [{ message: "weird" }, "error"],
  ])("%o -> %s", (err, status) => {
    expect(classifyError(err)).toBe(status);
  });

  it("http codes", () => {
    expect(statusFromHttp(200)).toBe("ok");
    expect(statusFromHttp(301)).toBe("ok");
    expect(statusFromHttp(401)).toBe("restricted");
    expect(statusFromHttp(404)).toBe("http_error");
  });

  it("sortResults puts up first, then fastest", () => {
    const mk = (name: string, up: boolean, latencyMs?: number): CheckResult => ({
      server: srv(name),
      status: up ? "ok" : "timeout",
      up,
      ...(latencyMs !== undefined ? { latencyMs } : {}),
    });
    const sorted = sortResults([mk("c", false), mk("b", true, 50), mk("a", true, 10)]);
    expect(sorted.map((r) => r.server.name)).toEqual(["a", "b", "c"]);
  });
});
