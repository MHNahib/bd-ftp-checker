import dns, { type LookupAddress } from "node:dns";
import type { LookupFunction } from "node:net";

type Entry = Promise<LookupAddress[]>;

/**
 * Per-run DNS cache. Every hostname is resolved once (failures are cached too,
 * so 5 URLs on one dead domain fail instantly after the first).
 * The returned `lookup` matches `net.LookupFunction` and can be passed to
 * `net.connect`, `tls.connect`, `http.request` and agents.
 */
export function createDnsCache(resolver: typeof dns.lookup = dns.lookup) {
  const cache = new Map<string, Entry>();

  function resolveAll(hostname: string): Entry {
    let entry = cache.get(hostname);
    if (!entry) {
      entry = new Promise<LookupAddress[]>((res, rej) => {
        resolver(hostname, { all: true }, (err, addresses) => {
          if (err) rej(err);
          else res(addresses);
        });
      });
      // keep the rejected promise cached but avoid unhandled-rejection noise
      entry.catch(() => {});
      cache.set(hostname, entry);
    }
    return entry;
  }

  const lookup: LookupFunction = (hostname, options, callback) => {
    resolveAll(hostname).then(
      (all) => {
        const family = options.family === 4 || options.family === 6 ? options.family : 0;
        const list = family ? all.filter((a) => a.family === family) : all;
        if (list.length === 0) {
          const err = Object.assign(new Error(`getaddrinfo ENOTFOUND ${hostname}`), {
            code: "ENOTFOUND",
            hostname,
          });
          callback(err, "", 0);
          return;
        }
        if (options.all) {
          callback(null, list);
        } else {
          const first = list[0] as LookupAddress;
          callback(null, first.address, first.family);
        }
      },
      (err: NodeJS.ErrnoException) => callback(err, "", 0),
    );
  };

  return {
    lookup,
    resolve: resolveAll,
    get size() {
      return cache.size;
    },
    clear: () => cache.clear(),
  };
}

export type DnsCache = ReturnType<typeof createDnsCache>;
