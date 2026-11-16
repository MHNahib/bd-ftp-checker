import { readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { ensureDir, paths } from "../paths.js";
import type { CheckResult, ScanSummary } from "../types.js";
import { CONTRIBUTORS_IMG, CONTRIBUTORS_URL } from "./banner.js";
import { groupByProvider } from "./formats.js";

export interface HtmlOptions {
  /** e.g. "You are probably on FTPBD (high confidence)" */
  note?: string;
}

const ESC: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESC[c] ?? c);
}

/** Only http(s) links are rendered as clickable. */
function safeHref(url: string): string | undefined {
  return /^https?:\/\//i.test(url) ? escapeHtml(url) : undefined;
}

function latencyClass(ms: number | undefined): string {
  if (ms === undefined) return "";
  if (ms < 100) return "fast";
  if (ms < 500) return "mid";
  return "slow";
}

function row(r: CheckResult): string {
  const href = safeHref(r.server.url);
  const name = escapeHtml(r.server.name);
  const link = href
    ? `<a href="${href}" target="_blank" rel="noopener noreferrer">${name}</a>`
    : name;
  const status = r.httpStatus ? `${r.status} ${r.httpStatus}` : r.status;
  const latency =
    r.latencyMs !== undefined
      ? `<span class="lat ${latencyClass(r.latencyMs)}">${r.latencyMs} ms</span>`
      : "";
  const title = r.error ? ` title="${escapeHtml(r.error)}"` : "";
  const search = escapeHtml(`${r.server.url} ${r.server.name} ${r.server.provider}`.toLowerCase());
  return `<tr data-up="${r.up ? 1 : 0}" data-provider="${escapeHtml(r.server.provider)}" data-q="${search}">
<td><span class="dot ${r.up ? "up" : "down"}"></span></td>
<td class="srv">${link}<div class="url">${escapeHtml(r.server.url)}</div></td>
<td>${escapeHtml(r.server.provider)}</td>
<td><span class="tag">${r.server.type}</span></td>
<td><span class="st ${r.up ? "up" : "down"}"${title}>${escapeHtml(status)}</span></td>
<td class="num">${latency}</td>
</tr>`;
}

const CSS = `
:root{--bg:#f7f7f8;--card:#fff;--fg:#1b1b1f;--muted:#6b6b76;--line:#e4e4e9;--accent:#0a7c5a;--up:#14915f;--down:#c43d3d;--mid:#b7791f;--tag:#eef0f3;color-scheme:light}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#111214;--card:#1a1b1e;--fg:#e9e9ee;--muted:#9a9aa6;--line:#2b2c31;--accent:#3ccf9a;--up:#3ccf9a;--down:#f06a6a;--mid:#e0b04a;--tag:#26272c;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#111214;--card:#1a1b1e;--fg:#e9e9ee;--muted:#9a9aa6;--line:#2b2c31;--accent:#3ccf9a;--up:#3ccf9a;--down:#f06a6a;--mid:#e0b04a;--tag:#26272c;color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:1100px;margin:0 auto;padding:24px 16px 48px}
header{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:12px;margin-bottom:16px}
h1{margin:0;font-size:22px}
.sub{color:var(--muted);margin-top:4px}
.sub a{color:var(--accent)}
.stats{display:flex;gap:10px;flex-wrap:wrap;margin:16px 0}
.stat{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:10px 14px;min-width:120px}
.stat b{display:block;font-size:20px}
.stat span{color:var(--muted);font-size:12px}
.note{background:var(--card);border:1px solid var(--line);border-left:3px solid var(--accent);border-radius:8px;padding:10px 14px;margin-bottom:16px}
.controls{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px}
input,select,button{font:inherit;color:var(--fg);background:var(--card);border:1px solid var(--line);border-radius:8px;padding:7px 10px}
input{flex:1 1 220px;min-width:0}
button{cursor:pointer}
.wrap{background:var(--card);border:1px solid var(--line);border-radius:10px;overflow-x:auto}
table{width:100%;border-collapse:collapse}
th,td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--line);vertical-align:top}
th{font-size:12px;color:var(--muted);font-weight:600;text-transform:uppercase;letter-spacing:.03em}
tr:last-child td{border-bottom:0}
.num{text-align:right;white-space:nowrap}
.srv a{color:var(--fg);font-weight:600;text-decoration:none}
.srv a:hover{color:var(--accent);text-decoration:underline}
.url{color:var(--muted);font-size:12px;word-break:break-all}
.dot{display:inline-block;width:9px;height:9px;border-radius:50%;margin-top:5px}
.dot.up{background:var(--up)}.dot.down{background:var(--down)}
.st.up{color:var(--up)}.st.down{color:var(--down)}
.tag{background:var(--tag);border-radius:5px;padding:1px 6px;font-size:12px}
.lat{font-variant-numeric:tabular-nums}
.lat.fast{color:var(--up)}.lat.mid{color:var(--mid)}.lat.slow{color:var(--down)}
.empty{padding:24px;text-align:center;color:var(--muted)}
footer{margin-top:20px;color:var(--muted);font-size:12px}
.contrib{margin-top:28px;border-top:1px solid var(--line);padding-top:16px}
.contrib h2{font-size:14px;margin:0 0 10px;color:var(--muted);font-weight:600}
.contrib img{max-width:100%;height:auto}
@media (max-width:640px){.hide-sm{display:none}th,td{padding:7px 8px}}
`;

const JS = `
(function(){
var q=document.getElementById('q'),p=document.getElementById('prov'),s=document.getElementById('stat'),
rows=[].slice.call(document.querySelectorAll('tbody tr')),cnt=document.getElementById('cnt'),empty=document.getElementById('empty');
function apply(){var t=q.value.trim().toLowerCase(),pv=p.value,sv=s.value,n=0;
rows.forEach(function(r){var ok=(!t||r.dataset.q.indexOf(t)>-1)&&(!pv||r.dataset.provider===pv)&&(!sv||(sv==='up')===(r.dataset.up==='1'));
r.hidden=!ok;if(ok)n++;});cnt.textContent=n;empty.hidden=n>0;}
q.addEventListener('input',apply);p.addEventListener('change',apply);s.addEventListener('change',apply);
var root=document.documentElement,btn=document.getElementById('theme');
try{var saved=localStorage.getItem('bdftp-theme');if(saved)root.dataset.theme=saved;}catch(e){}
btn.addEventListener('click',function(){var dark=root.dataset.theme?root.dataset.theme==='dark':matchMedia('(prefers-color-scheme: dark)').matches;
root.dataset.theme=dark?'light':'dark';try{localStorage.setItem('bdftp-theme',root.dataset.theme);}catch(e){}});
apply();})();
`;

/** Self-contained HTML report (no external assets). */
export function toHtml(summary: ScanSummary, opts: HtmlOptions = {}): string {
  const providers = groupByProvider(summary.results).map(([p]) => p);
  const fastest = summary.results.find((r) => r.up && r.latencyMs !== undefined);
  const providersUp = new Set(summary.results.filter((r) => r.up).map((r) => r.server.provider));
  const when = new Date(summary.startedAt).toLocaleString();

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>BD FTP Checker</title>
<style>${CSS}</style>
</head>
<body>
<main>
<header>
<div>
<h1>BD FTP Checker</h1>
<div class="sub">${escapeHtml(when)}</div>
</div>
<button id="theme" type="button" aria-label="Toggle dark mode">Theme</button>
</header>
<div class="stats">
<div class="stat"><b>${summary.up}/${summary.total}</b><span>reachable</span></div>
<div class="stat"><b>${(summary.durationMs / 1000).toFixed(1)}s</b><span>scan time</span></div>
<div class="stat"><b>${providersUp.size}</b><span>providers up</span></div>
${fastest ? `<div class="stat"><b>${fastest.latencyMs} ms</b><span>fastest: ${escapeHtml(fastest.server.name)}</span></div>` : ""}
</div>
${opts.note ? `<div class="note">${escapeHtml(opts.note)}</div>` : ""}
<div class="controls">
<input id="q" type="search" placeholder="Search servers…" aria-label="Search">
<select id="prov" aria-label="Provider"><option value="">All providers</option>${providers
    .map((p) => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`)
    .join("")}</select>
<select id="stat" aria-label="Status"><option value="">All</option><option value="up" selected>Reachable</option><option value="down">Unreachable</option></select>
</div>
<div class="wrap">
<table>
<thead><tr><th></th><th>Server</th><th>Provider</th><th>Type</th><th>Status</th><th class="num">Latency</th></tr></thead>
<tbody>
${summary.results.map(row).join("\n")}
</tbody>
</table>
<div id="empty" class="empty" hidden>No servers match.</div>
</div>
<footer>Showing <span id="cnt">${summary.results.length}</span> of ${summary.total} · generated by bd-ftp-checker</footer>
<section class="contrib">
<h2>Contributors</h2>
<a href="${CONTRIBUTORS_URL}" target="_blank" rel="noopener noreferrer"><img src="${CONTRIBUTORS_IMG}" alt="bd-ftp-checker contributors"></a>
</section>
</main>
<script>${JS}</script>
</body>
</html>
`;
}

function stamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

export const KEEP_REPORTS = 20;

/** Delete oldest report-* files beyond `keep`. */
export function pruneReports(dir: string, keep = KEEP_REPORTS): void {
  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => /^report-\d{8}-\d{6}\./.test(f));
  } catch {
    return;
  }
  files.sort();
  for (const f of files.slice(0, Math.max(0, files.length - keep))) {
    rmSync(join(dir, f), { force: true });
  }
}

/**
 * Write a report. Without `out` it goes to ~/.bd-ftp-checker/reports/report-<stamp>.<ext>
 * and old reports are pruned. Returns the absolute path.
 */
export function writeReport(content: string, ext: string, out?: string): string {
  let file: string;
  if (out) {
    file = resolve(out);
    ensureDir(dirname(file));
  } else {
    const dir = ensureDir(paths.reports);
    file = join(dir, `report-${stamp()}.${ext}`);
  }
  writeFileSync(file, content, "utf8");
  if (!out) pruneReports(paths.reports);
  return file;
}
