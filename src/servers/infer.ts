import { isIP } from "node:net";
import type { ServerType } from "../types.js";

const PROVIDER_ALIASES: Record<string, string> = {
  circleftp: "Circle Network",
  circlenetworkbd: "Circle Network",
  ftpbd: "FTPBD",
  sambd: "SAM Online",
  samftp: "SAM Online",
  discoveryftp: "Discovery Online",
  discoverynetbd: "Discovery Online",
  dflix: "Discovery Online",
  ebox: "eBox",
  icc: "ICC Communication",
  iccfios: "ICC Communication",
  icctalk: "ICC Communication",
};

const FTP_LABEL =
  /^(ftp\d*|fs|file|files|fileserver|server\d*|cds\d*|media|movies?|nas\d*|data|new|old|bdix|dl|download)$/i;

function registrableLabel(host: string): string {
  const parts = host.replace(/^www\./, "").split(".");
  const ccSld = parts.length >= 3 && /^(com|net|org|gov|edu|ac)$/.test(parts.at(-2) ?? "");
  return (ccSld ? parts.at(-3) : parts.at(-2)) ?? host;
}

/** Best-effort provider name from a hostname (IPs return undefined). */
export function inferProvider(host: string): string | undefined {
  if (isIP(host)) return undefined;
  const label = registrableLabel(host.toLowerCase());
  return PROVIDER_ALIASES[label] ?? label.charAt(0).toUpperCase() + label.slice(1);
}

export function inferType(u: URL): ServerType {
  const host = u.hostname.toLowerCase();
  if (host.includes("jellyfin") || u.port === "8920") return "jellyfin";
  if (host.includes("emby") || u.port === "8096") return "emby";
  if (u.port === "32400") return "plex";
  if (isIP(host) || host.includes("ftp")) return "ftp";
  const first = host.replace(/^www\./, "").split(".")[0] ?? "";
  if (host.split(".").length > 2 && FTP_LABEL.test(first)) return "ftp";
  if (u.pathname.length > 1) return "ftp";
  return "web";
}

export function displayName(u: URL): string {
  const path = u.pathname === "/" ? "" : u.pathname;
  return `${u.hostname}${u.port ? `:${u.port}` : ""}${path}`;
}
