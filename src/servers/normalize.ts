/**
 * Canonical form used for dedupe: lowercase scheme+host, default port dropped,
 * no trailing slash (except root), no hash. Returns null for invalid / non-http URLs.
 */
export function normalizeUrl(input: string): string | null {
  let raw = input.trim();
  if (!raw) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) raw = `http://${raw}`;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  if (!u.hostname) return null;
  u.hash = "";
  const path = u.pathname.replace(/\/+$/, "");
  return `${u.protocol}//${u.host.toLowerCase()}${path}${u.search}`;
}
