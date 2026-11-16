import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** App data dir: $BDFTP_HOME or ~/.bd-ftp-checker */
export function appDir(): string {
  return process.env.BDFTP_HOME || join(homedir(), ".bd-ftp-checker");
}

export const paths = {
  get root() {
    return appDir();
  },
  get reports() {
    return join(appDir(), "reports");
  },
  get history() {
    return join(appDir(), "history.json");
  },
  get cachedServers() {
    return join(appDir(), "servers.json");
  },
  get rc() {
    return process.env.BDFTP_CONFIG || join(homedir(), ".bdftprc");
  },
};

export function ensureDir(dir: string): string {
  mkdirSync(dir, { recursive: true });
  return dir;
}
