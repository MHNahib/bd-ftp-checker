import { groupByProvider } from "./output/formats.js";
import { openTarget } from "./output/open.js";
import type { CheckResult } from "./types.js";

/** Let the user pick reachable servers (grouped by provider) and open them in the browser. */
export async function pickAndOpen(results: CheckResult[]): Promise<number> {
  const up = results.filter((r) => r.up);
  if (!up.length) return 0;
  const p = await import("@clack/prompts");
  const options: Record<string, { value: string; label: string; hint?: string }[]> = {};
  for (const [provider, list] of groupByProvider(up)) {
    options[provider] = list.map((r) => ({
      value: r.server.url,
      label: r.server.url,
      ...(r.latencyMs !== undefined ? { hint: `${r.latencyMs} ms` } : {}),
    }));
  }
  const picked = await p.groupMultiselect({
    message: "Open which servers? (space to select, enter to open)",
    options,
    required: false,
  });
  if (p.isCancel(picked)) {
    p.cancel("Nothing opened.");
    return 0;
  }
  for (const url of picked) await openTarget(url);
  p.outro(`Opened ${picked.length} server(s).`);
  return picked.length;
}
