import { spawn } from "node:child_process";

/** Command + args that open a file or URL with the OS default handler. */
export function openCommand(
  target: string,
  platform: NodeJS.Platform = process.platform,
): [string, string[]] {
  if (platform === "win32") {
    // `start` is a cmd builtin; the empty "" is the window title argument.
    return ["cmd", ["/c", "start", '""', target.replace(/&/g, "^&")]];
  }
  if (platform === "darwin") return ["open", [target]];
  return ["xdg-open", [target]];
}

/** Open a file or URL. Resolves false (never throws) if no opener is available. */
export function openTarget(target: string): Promise<boolean> {
  const [cmd, args] = openCommand(target);
  return new Promise((resolve) => {
    try {
      const child = spawn(cmd, args, {
        stdio: "ignore",
        detached: true,
        windowsVerbatimArguments: process.platform === "win32",
      });
      child.once("error", () => resolve(false));
      child.once("spawn", () => {
        child.unref();
        resolve(true);
      });
    } catch {
      resolve(false);
    }
  });
}
