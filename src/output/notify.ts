import { spawn } from "node:child_process";

// Title/body travel through env vars / argv, never interpolated into a script.
const WIN_SCRIPT = `
$ErrorActionPreference='Stop'
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] > $null
$t = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)
$x = $t.GetElementsByTagName('text')
$x.Item(0).AppendChild($t.CreateTextNode($env:BDFTP_TITLE)) > $null
$x.Item(1).AppendChild($t.CreateTextNode($env:BDFTP_BODY)) > $null
$id = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe'
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($id).Show([Windows.UI.Notifications.ToastNotification]::new($t))
`;

const MAC_SCRIPT =
  "on run argv\ndisplay notification (item 2 of argv) with title (item 1 of argv)\nend run";

export function notifyCommand(
  title: string,
  body: string,
  platform: NodeJS.Platform = process.platform,
): { cmd: string; args: string[]; env?: Record<string, string> } | undefined {
  if (platform === "win32") {
    const encoded = Buffer.from(WIN_SCRIPT, "utf16le").toString("base64");
    return {
      cmd: "powershell.exe",
      args: ["-NoProfile", "-NonInteractive", "-EncodedCommand", encoded],
      env: { BDFTP_TITLE: title, BDFTP_BODY: body },
    };
  }
  if (platform === "darwin") return { cmd: "osascript", args: ["-e", MAC_SCRIPT, title, body] };
  if (platform === "linux" || platform === "freebsd" || platform === "openbsd") {
    return { cmd: "notify-send", args: ["--app-name=bd-ftp-checker", title, body] };
  }
  return undefined;
}

/** Desktop notification via OS built-ins. Never throws; resolves false if unavailable. */
export function notify(title: string, body: string): Promise<boolean> {
  const c = notifyCommand(title, body);
  if (!c) return Promise.resolve(false);
  return new Promise((resolve) => {
    try {
      const child = spawn(c.cmd, c.args, {
        stdio: "ignore",
        windowsHide: true,
        env: { ...process.env, ...c.env },
      });
      child.once("error", () => resolve(false));
      child.once("exit", (code) => resolve(code === 0));
    } catch {
      resolve(false);
    }
  });
}
