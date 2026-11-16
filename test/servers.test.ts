import { describe, expect, it } from "vitest";
import {
  dedupe,
  filterServers,
  loadServers,
  parseCustomList,
  readBundledList,
  serverFromUrl,
} from "../src/servers/load.js";
import { compareVersions, validateServerList } from "../src/servers/validate.js";
import type { Server } from "../src/types.js";

const s = (url: string, provider: string, type: Server["type"] = "ftp"): Server => ({
  url,
  name: url,
  provider,
  type,
});

describe("bundled list", () => {
  it("is valid", () => {
    expect(validateServerList(readBundledList())).toEqual([]);
  });

  it("loads with extra urls deduped", async () => {
    const { servers, source } = await loadServers({
      useCache: false,
      add: ["http://media.ftpbd.net/", "http://new.example.test"],
    });
    expect(source).toBe("bundled");
    expect(servers.filter((x) => x.url === "http://media.ftpbd.net")).toHaveLength(1);
    expect(servers.at(-1)?.url).toBe("http://new.example.test");
  });
});

describe("validate", () => {
  const base = { version: "2026.11.16", updatedAt: "2026-11-16T00:00:00Z" };

  it("reports bad entries", () => {
    const errors = validateServerList({
      ...base,
      servers: [
        s("http://a.test", "A"),
        s("http://a.test", "A"),
        s("http://b.test/", "B"),
        { url: "ftp://c", name: "", provider: "", type: "nope" },
      ],
    });
    expect(errors.join("\n")).toMatch(/duplicate/);
    expect(errors.join("\n")).toMatch(/not normalized/);
    expect(errors.join("\n")).toMatch(/invalid url/);
    expect(errors.join("\n")).toMatch(/type must be/);
  });

  it("checks version format", () => {
    expect(validateServerList({ ...base, version: "2026.11.16.2", servers: [] })).toEqual([]);
    expect(validateServerList({ ...base, version: "v2", servers: [] })[0]).toMatch(/version/);
  });

  it("compares versions", () => {
    expect(compareVersions("2026.11.16", "2026.2.1")).toBeGreaterThan(0);
    expect(compareVersions("2026.11.16.1", "2026.11.16")).toBeGreaterThan(0);
    expect(compareVersions("2026.11.16", "2026.11.16")).toBe(0);
  });
});

describe("custom lists", () => {
  it("parses text with comments", () => {
    const list = parseCustomList("# mine\nhttp://a.test\n\n  b.test  # bare host\n");
    expect(list.map((x) => x.url)).toEqual(["http://a.test", "http://b.test"]);
    expect(list[0]?.provider).toBe("Custom");
  });

  it("parses JSON shapes", () => {
    expect(parseCustomList('["http://a.test"]')).toHaveLength(1);
    const obj = parseCustomList(
      JSON.stringify({
        servers: [{ url: "http://a.test", name: "A", provider: "P", type: "emby" }],
      }),
    );
    expect(obj[0]).toMatchObject({ name: "A", provider: "P", type: "emby" });
    expect(() => parseCustomList('{"x":1}')).toThrow();
  });

  it("serverFromUrl rejects junk", () => {
    expect(serverFromUrl("not a url at all")).toBeNull();
  });
});

describe("filters", () => {
  const list = [
    s("http://a.circle.test", "Circle Network"),
    s("http://b.ftpbd.test", "FTPBD", "emby"),
    s("http://c.other.test", "Other", "h5ai"),
  ];

  it("provider substring, case-insensitive", () => {
    expect(filterServers(list, { provider: ["CIRCLE", "ftp"] }).map((x) => x.provider)).toEqual([
      "Circle Network",
      "FTPBD",
    ]);
  });

  it("type and search", () => {
    expect(filterServers(list, { type: ["emby", "h5ai"] })).toHaveLength(2);
    expect(filterServers(list, { search: "other" })).toHaveLength(1);
    expect(filterServers(list, {})).toHaveLength(3);
  });

  it("dedupe normalises urls", () => {
    expect(dedupe([s("http://a.test", "A"), s("http://A.test/", "A")])).toHaveLength(1);
  });
});
