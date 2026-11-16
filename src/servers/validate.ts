import { SERVER_TYPES, type ServerList } from "../types.js";
import { normalizeUrl } from "./normalize.js";

/** Returns a list of problems; empty means valid. */
export function validateServerList(data: unknown): string[] {
  const errors: string[] = [];
  if (!data || typeof data !== "object") return ["root must be an object"];
  const list = data as Partial<ServerList>;
  if (typeof list.version !== "string" || !/^\d{4}\.\d{1,2}\.\d{1,2}(\.\d+)?$/.test(list.version))
    errors.push("version must look like YYYY.M.D or YYYY.M.D.N");
  if (typeof list.updatedAt !== "string" || Number.isNaN(Date.parse(list.updatedAt)))
    errors.push("updatedAt must be an ISO date");
  if (!Array.isArray(list.servers)) return [...errors, "servers must be an array"];

  const seen = new Map<string, number>();
  list.servers.forEach((s, i) => {
    const at = `servers[${i}]`;
    if (!s || typeof s !== "object") {
      errors.push(`${at}: must be an object`);
      return;
    }
    const norm = typeof s.url === "string" ? normalizeUrl(s.url) : null;
    if (!norm) errors.push(`${at}: invalid url ${JSON.stringify(s.url)}`);
    else if (norm !== s.url) errors.push(`${at}: url not normalized, use ${norm}`);
    else if (seen.has(norm))
      errors.push(`${at}: duplicate of servers[${seen.get(norm)}] (${norm})`);
    else seen.set(norm, i);
    if (typeof s.name !== "string" || !s.name) errors.push(`${at}: name required`);
    if (typeof s.provider !== "string" || !s.provider) errors.push(`${at}: provider required`);
    if (!SERVER_TYPES.includes(s.type))
      errors.push(`${at}: type must be one of ${SERVER_TYPES.join("|")}`);
  });
  return errors;
}

/** Compare "YYYY.M.D[.N]" versions. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}
