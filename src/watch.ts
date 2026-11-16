import type { Options } from "./config.js";
import { diffScans, toHistory } from "./history.js";
import { notify } from "./output/notify.js";
import { runScan, type ScanIO } from "./scan.js";

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        resolve();
      },
      { once: true },
    );
  });
}

/** Re-scan every `o.watch` minutes; print and notify what came up / went down. Stops on abort. */
export async function watch(o: Options, io: ScanIO): Promise<void> {
  const { out, c, signal } = io;
  const minutes = o.watch ?? 5;
  let run = await runScan(o, io, { first: true, openReport: true });
  let prev = toHistory(run.summary);

  while (!signal?.aborted) {
    out.write(c.dim(`\nWatching — next scan in ${minutes} min (Ctrl+C to stop)\n`));
    await sleep(minutes * 60_000, signal);
    if (signal?.aborted) break;

    run = await runScan({ ...o, quiet: true, history: false, format: [], interactive: false }, io, {
      first: false,
      openReport: false,
    });
    const d = diffScans(prev, run.summary.results);
    prev = toHistory(run.summary);
    const time = new Date().toLocaleTimeString();
    out.write(`${c.dim(`[${time}]`)} ${run.summary.up}/${run.summary.total} reachable\n`);
    for (const u of d.cameUp) out.write(`  ${c.green("▲ up")}   ${u}\n`);
    for (const u of d.wentDown) out.write(`  ${c.red("▼ down")} ${u}\n`);

    if (o.notify && (d.cameUp.length || d.wentDown.length)) {
      const parts = [];
      if (d.cameUp.length) parts.push(`${d.cameUp.length} came up`);
      if (d.wentDown.length) parts.push(`${d.wentDown.length} went down`);
      const first = d.cameUp[0] ?? d.wentDown[0] ?? "";
      await notify(`BD FTP Checker: ${parts.join(", ")}`, first);
    }
  }
}
