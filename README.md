# BD FTP CHECKER

Find out which Bangladeshi FTP / BDIX media servers you can reach from your internet connection, in a few seconds.

![npm](https://img.shields.io/npm/v/bd-ftp-checker?color=green&style=flat-square) ![npm](https://img.shields.io/npm/dm/bd-ftp-checker?color=orange&style=flat-square) [![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](https://choosealicense.com/licenses/mit/)

Most Bangladeshi ISPs host FTP servers, Emby / Jellyfin / Plex servers and file indexes (h5ai) that are fast but only reachable from inside their network (BDIX). Which ones work for you depends on your ISP. `bd-ftp-checker` tests a built-in list of ~700 servers and tells you which ones you can use, how fast they answer, and why the others failed.

## Requirements

- [Node.js](https://nodejs.org/) **20.12 or newer** (check with `node -v`)
- Windows, macOS or Linux

## Run it

No install needed:

```bash
npx bd-ftp-checker
```

Or install it once and use the `bd-ftp-checker` command:

```bash
npm install -g bd-ftp-checker
bd-ftp-checker
```

### Run from source

```bash
git clone https://github.com/MHNahib/bd-ftp-checker.git
cd bd-ftp-checker
npm ci
npm run build
node dist/cli.js            # or: npm run dev   (runs the TypeScript directly)
```

To get the `bd-ftp-checker` command from your clone, run `npm link` (undo it with `npm unlink -g bd-ftp-checker`).

## What to expect

A scan of the full list takes **about 5–10 seconds**. While it runs you see a progress bar, and every reachable server is printed as soon as it answers. When it finishes you get a summary:

```
Checking 708 servers (bundled v2026.11.16, concurrency 256, timeout 3000 ms)

✔ http://new.circleftp.net [Circle Network] ok 200 42 ms
✔ http://146.196.48.10 [Taltola] ok 200 14 ms
✔ http://media.ftpbd.net [FTPBD] restricted 403 61 ms
...

321/708 reachable in 5.9s
Fastest:
  10 ms    http://mirpurnetbd.com [Mirpurnetbd]
  13 ms    http://downloads.geniousnet.com [Geniousnet]
  14 ms    http://www.mixonbd.com [Mixonbd]
Down: timeout 209, dns 127, http_error 21, reset 16, refused 13, tls 1
4 new up, 7 went down since 2h ago
Report: C:\Users\you\.bd-ftp-checker\reports\report-20261116-110337.html
Contributors: https://github.com/MHNahib/bd-ftp-checker/graphs/contributors
```

Then an **HTML report** opens in your browser. It lists every server with its status and latency, and has a search box, provider and status filters, and a dark mode toggle. Click a server to open it.

Things to know:

- Results depend on your ISP. On one ISP 50 servers may work and on another 300. That is normal.
- `restricted` (HTTP 401/403) counts as reachable: the server answered but wants a login or blocks directory listing.
- The line "You are probably on &lt;ISP&gt;" appears only when the results make it clear. It is a local guess; nothing is sent anywhere.
- "N new up, M went down" compares with your previous run. It does not appear on the first run.
- Reports, scan history and downloaded server lists are stored in `~/.bd-ftp-checker/` (on Windows `C:\Users\<you>\.bd-ftp-checker\`). Only the 20 newest reports are kept.
- Press `Ctrl+C` to stop.

## Features

- **Fast:** ~700 servers in 5–10 seconds, using parallel checks, a timeout on every server, a TCP check before HTTP, and a DNS cache.
- **Accurate:** tries `HEAD` first, falls back to `GET` for servers that reject `HEAD`, and follows redirects.
- **Tells you why** a server failed: timeout, DNS, refused, reset, TLS or HTTP error.
- **Latency** for every server, with the 5 fastest listed in the summary.
- **Filters** by provider, server type (`ftp`, `emby`, `jellyfin`, `plex`, `h5ai`, `web`) or any text.
- **Output formats:** terminal, HTML, JSON, CSV and Markdown, or JSON straight to stdout for scripts.
- **ISP guess** from which servers you can reach.
- **History:** shows what came up or went down since your last run.
- **Watch mode:** re-checks every few minutes and shows a desktop notification when a server comes up or goes down.
- **Interactive mode:** pick reachable servers from a list and open them in your browser.
- **Speed test:** measures download speed from a server, picking a server and file for you if you don't give one.
- **Server list updates:** download the latest list without upgrading the package.
- **Custom lists:** check your own servers, or add extra ones to the built-in list.
- **Config file** for options you always use.

## Commands

| Command | What it does |
|---|---|
| `bd-ftp-checker` | Check all servers (same as `bd-ftp-checker scan`) |
| `bd-ftp-checker list` | Print the server list grouped by provider, without checking anything |
| `bd-ftp-checker update` | Download the newest server list from GitHub |
| `bd-ftp-checker speedtest [url]` | Download speed test |
| `bd-ftp-checker --help` | Show all options |
| `bd-ftp-checker --version` | Show the version |

With `npx`, put `npx` in front: `npx bd-ftp-checker list`.

## Examples

```bash
# Check only one or more providers (case-insensitive, part of the name is enough)
bd-ftp-checker -p circle
bd-ftp-checker -p circle -p ftpbd

# Check only Emby and Jellyfin servers
bd-ftp-checker --type emby --type jellyfin

# Check servers whose address contains some text
bd-ftp-checker -s discovery

# See which providers and servers are in the list
bd-ftp-checker list
bd-ftp-checker list -p ftpbd

# Also print the servers that failed while scanning
bd-ftp-checker -v

# Don't open the browser
bd-ftp-checker --no-open

# Pick reachable servers from a list and open them in the browser
# (arrow keys to move, space to select, enter to open)
bd-ftp-checker -i

# Keep checking every 10 minutes and get a desktop notification on changes
bd-ftp-checker --watch 10

# Save CSV and Markdown reports to a folder of your choice
bd-ftp-checker -f csv -f md -o ./results/scan

# Print JSON for scripts (nothing else is printed)
bd-ftp-checker --json > results.json
bd-ftp-checker --json | jq -r '.results[] | select(.up) | .url'

# Check your own servers (one URL per line, lines starting with # are ignored)
bd-ftp-checker --list my-servers.txt

# Add servers to the built-in list for this run
bd-ftp-checker --add http://10.16.100.244 --add http://my.server.net

# Speed test: picks a fast server and a media file for you
bd-ftp-checker speedtest

# Speed test a specific file for 5 seconds
bd-ftp-checker speedtest http://example.net/Movies/film.mkv --seconds 5

# Get the newest server list
bd-ftp-checker update

# Slow connection? Give each server more time
bd-ftp-checker -t 6000
```

## Flags and when to use them

Flags can be combined, for example `bd-ftp-checker -p circle --type emby --no-open -v`.

### Choosing which servers to check

| Flag | What it does | Use it when |
|---|---|---|
| `-p, --provider <name>` | Only servers of this provider. Case-insensitive, part of the name is enough, repeatable | You only care about your own ISP's servers (`-p ftpbd`) or a few known providers (`-p circle -p ftpbd`). Also makes the scan faster |
| `--type <type>` | Only `ftp`, `emby`, `jellyfin`, `plex`, `h5ai` or `web`, repeatable | You want media servers only (`--type emby --type jellyfin`) or plain file listings only (`--type ftp --type h5ai`) |
| `-s, --search <text>` | Only servers whose URL, name or provider contains the text | You remember part of an address (`-s discovery`, `-s 10.16.`) |
| `-l, --list <file>` | Check your own list instead of the built-in one | You have private or office servers, or want to test a list before contributing it |
| `-a, --add <url>` | Add a server to the list for this run, repeatable | You want to try one new server alongside the rest |

Use `bd-ftp-checker list` with the same flags to see what would be checked without checking anything.

### Speed and accuracy

| Flag | What it does | Use it when |
|---|---|---|
| `-t, --timeout <ms>` | How long to wait for each server (default 3000) | Results change between runs or you are on a slow / mobile connection: raise it (`-t 6000`). Want a quicker, rougher scan: lower it (`-t 1500`) |
| `-c, --concurrency <n>` | How many servers are checked at the same time (default 256) | Your router struggles or you see many random `timeout` / `reset`: lower it (`-c 64`). It rarely helps to raise it |
| `--no-tcp-precheck` | Skip the TCP connection test and go straight to HTTP | Only for debugging, if you suspect the TCP test gives wrong results behind a proxy or firewall |

### What you see

| Flag | What it does | Use it when |
|---|---|---|
| `-v, --verbose` | Also print failed servers while scanning, with the reason | You want to know why a particular server is not working |
| `-q, --quiet` | No banner, progress or summary; reports are still written | Running from a scheduled task where you only want the report file |
| `--no-color` | Plain text output (`NO_COLOR=1` works too) | Your terminal shows strange characters, or you save the output to a file |
| `--no-open` | Don't open the HTML report in the browser | You run it often and only read the terminal summary |
| `-i, --interactive` | After the scan, pick reachable servers from a list and open them | You want to start browsing right away (arrow keys to move, space to select, enter to open) |

### Reports and files

| Flag | What it does | Use it when |
|---|---|---|
| `-f, --format <fmt>` | Which outputs to make: `terminal`, `html`, `json`, `csv`, `md`. Repeatable or comma-separated (default `terminal,html`) | You want a spreadsheet (`-f csv`), something to paste on GitHub or Facebook (`-f md`), or data for another program (`-f json`) |
| `-o, --out <path>` | Save the report to this path. With several formats, the extension is swapped per format | You want the report in a fixed place (`-o ./scan.html`, or `-f csv -f md -o ./results/scan` for `scan.csv` + `scan.md`) |
| `--only-ok` | Leave unreachable servers out of the reports | You want to share a clean list of working servers |
| `--json` | Print only JSON to stdout: no banner, progress, report files or browser | Piping into another tool: `bd-ftp-checker --json \| jq ...` |
| `--no-history` | Don't compare with or save the previous run | Testing with filters or custom lists, so your normal history isn't changed |

### Monitoring

| Flag | What it does | Use it when |
|---|---|---|
| `-w, --watch [min]` | Scan again every N minutes (default 5) until `Ctrl+C`. Prints which servers came up or went down | Waiting for a server that is down to come back, or keeping an eye on your ISP's servers |
| `--no-notify` | No desktop notifications in watch mode | You only want the terminal output |

### Other

| Flag | What it does | Use it when |
|---|---|---|
| `--config <file>` | Use this config file instead of `~/.bdftprc` | You keep different setups, for example home and office |
| `--seconds <n>` | Speed test length in seconds (default 10, with `speedtest`) | A quick check (`--seconds 3`) or a steadier result (`--seconds 30`) |
| `-h, --help` | Show all options | |
| `-V, --version` | Show the version | Reporting a bug |

### What the status means

| Status | Meaning |
|---|---|
| `ok` | The server answered (HTTP 2xx/3xx) |
| `restricted` | The server answered 401/403: it is up but needs a login. Counted as reachable |
| `http_error` | The server answered with another error (404, 500, …) |
| `timeout` | No answer in time. Usually the server is not reachable from your ISP |
| `dns` | The domain name does not exist (any more) |
| `refused` | The machine is reachable but nothing is running on that port |
| `unreachable` | No network route to the server |
| `reset` | The connection was cut |
| `tls` | HTTPS handshake failed |

## Config file

Put options you always use in `~/.bdftprc` (JSON). Option names are the long names in camelCase. Command-line flags override the file.

```json
{
  "timeout": 4000,
  "provider": ["circle", "ftpbd"],
  "format": ["terminal", "html", "csv"],
  "open": false
}
```

Set the `BDFTP_HOME` environment variable to store reports and history somewhere other than `~/.bd-ftp-checker`.

## Custom server lists

`--list` accepts:

- a text file with one URL per line (`#` starts a comment):

  ```
  # my servers
  http://10.16.100.244
  http://my.server.net/movies/
  ```

- a JSON array of URLs: `["http://a.net", "http://b.net"]`
- a JSON file in the same format as [`data/servers.json`](data/servers.json)

## Troubleshooting

- **Almost everything shows `timeout`:** you are probably not on a BDIX-connected ISP, or you are using a VPN. Turn the VPN off and try again.
- **Results change between runs:** some servers are slow or overloaded. Try a longer timeout: `-t 6000`.
- **The browser didn't open:** open the file shown after `Report:`, or use `--no-open` and open it yourself.
- **No desktop notification on Linux:** install `notify-send` (package `libnotify-bin` on Debian/Ubuntu).
- **`npx` runs an old version:** use `npx bd-ftp-checker@latest`.

## How it works

```
 server list ──► filters ──► check pool (256 at a time) ──► sort ──► summary, ISP guess, history ──► reports
 (bundled /                   for each server:
  updated /                   1. DNS lookup (cached)
  your file)                  2. TCP connect
                              3. HTTP HEAD on that same connection
                              4. ranged GET if HEAD is refused, follow redirects
                              5. classify the answer or the error
```

1. **Server list.** The package ships `data/servers.json` (URL, name, provider, type for each server). `bd-ftp-checker update` downloads a newer copy from GitHub into `~/.bd-ftp-checker/servers.json`, which is used when its version is newer than the bundled one. `--list` replaces the list, `--add` appends to it. Duplicate URLs are removed.
2. **Filters.** `--provider`, `--type` and `--search` narrow the list before anything is sent over the network.
3. **Parallel checks.** Servers go through a pool that runs up to `--concurrency` checks at once. Most of the time goes to dead servers waiting for their timeout, so checking many at once is what keeps a full scan to a few seconds.
4. **DNS.** Each hostname is resolved once per run, and failures are remembered too, so ten URLs on one dead domain cost one lookup. The CLI raises Node's DNS thread pool to 64 threads (`UV_THREADPOOL_SIZE`); with Node's default of 4, slow lookups queue up and healthy servers show up as timeouts.
5. **TCP check.** A plain TCP connection to the server's port, with the timeout. Most unreachable servers fail here quickly (`timeout`, `refused`, `unreachable`) without an HTTP request. The open connection is reused for the HTTP request, so a reachable server costs one handshake.
6. **HTTP check.** A `HEAD` request (headers only, no download). Many BDIX servers answer `HEAD` with 400/403/404/405/500/501 or drop it, so the checker retries with `GET` and `Range: bytes=0-0` (asks for one byte) and closes the connection as soon as headers arrive, so it never downloads a file. Up to 3 redirects are followed. HTTPS certificates are not verified, because many of these servers use self-signed certificates and the question is only "does it answer".
7. **Classification.** 2xx/3xx is `ok`, 401/403 is `restricted` (up, needs login), other codes are `http_error`, and network errors are mapped to `timeout`, `dns`, `refused`, `unreachable`, `reset` or `tls`. Each server gets its connect time and time to first answer (latency).
8. **After the scan.** Results are sorted (reachable first, fastest first). The ISP guess looks for a provider whose private-network addresses (10.x, 172.16–31.x, 192.168.x, 100.64–127.x) answered, because only that ISP's customers can reach those; otherwise it picks a provider with clearly more reachable servers than the rest, or says nothing. The list of reachable servers is compared with `~/.bd-ftp-checker/history.json` from the last run, then saved.
9. **Reports.** The HTML report is one self-contained file (styles and script inside, no internet needed except the contributors image). Reports go to `~/.bd-ftp-checker/reports/` and only the newest 20 are kept.

Watch mode repeats steps 3–8 on a timer and compares each scan with the previous one. Notifications use what the OS already has (a PowerShell toast on Windows, `osascript` on macOS, `notify-send` on Linux), so there is nothing native to install.

The speed test downloads one file for up to `--seconds` and reports MB/s. Without a URL it scans first, takes the fastest FTP / h5ai servers, and looks through their directory listings (two levels deep) for a video, ISO or archive file.

Runtime dependencies: `picocolors` (colors) and `@clack/prompts` (only loaded for `-i`). HTTP, DNS, TCP and notifications use Node built-ins.

## Use it from code

```ts
import { checkServers, loadServers, filterServers, detectIsp, toHtml } from "bd-ftp-checker";

const { servers } = await loadServers();
const summary = await checkServers(filterServers(servers, { provider: ["circle"] }), {
  timeout: 3000,
  onResult: (r, done, total) => console.log(`${done}/${total}`, r.server.url, r.status),
});
console.log(summary.up, "reachable", detectIsp(summary.results));
```

DNS lookups use Node's libuv threadpool. For big scans, start Node with `UV_THREADPOOL_SIZE=64`, or slow DNS names will cause false timeouts. The CLI does this for you.

## Development guide

### Setup

You need Node.js 20.12+ and git.

```bash
git clone https://github.com/MHNahib/bd-ftp-checker.git
cd bd-ftp-checker
npm ci
npm run dev -- --help        # run the CLI from the TypeScript source
npm run dev -- -p circle     # anything after -- goes to the CLI
```

### Scripts

| Script | What it does |
|---|---|
| `npm run dev -- <flags>` | Run the CLI from source with `tsx` (no build) |
| `npm run build` | Bundle to `dist/` with tsup and write type definitions to `dist/types/` |
| `npm test` | Run the tests once (vitest) |
| `npm run test:watch` | Re-run tests on every change |
| `npm run typecheck` | TypeScript strict type check |
| `npm run check` | Biome lint + format check |
| `npm run check:fix` | Fix lint and formatting automatically |
| `npm run validate:servers` | Check `data/servers.json`: format, valid URLs, duplicates |

`npm publish` runs all of the checks above first (`prepublishOnly`).

### Project layout

```
data/servers.json         the server list
src/
  cli.ts                  argument parsing and commands
  index.ts                public API (what `import ... from "bd-ftp-checker"` gives you)
  scan.ts                 one scan: load → check → history → outputs
  config.ts               defaults, ~/.bdftprc, option validation
  history.ts, watch.ts, interactive.ts, paths.ts, types.ts
  core/                   pool, dns, tcp, probe, checker, errors, detect (ISP), speedtest
  output/                 banner, terminal, formats (json/csv/md), html, open, notify
  servers/                load, filter, normalize, infer, validate, update
scripts/                  validate-servers.ts, migrate-servers.ts (one-off v1 → v2 migration)
test/                     vitest tests; helpers.ts has the mock HTTP server
```

### Rules for code

- TypeScript strict, ESM only, Node 20.12+. Use `node:` imports for built-ins.
- Don't add runtime dependencies unless there is no reasonable built-in way. Every dependency slows down `npx bd-ftp-checker`.
- Never let one bad server break a scan: network code must time out, close its sockets, and turn errors into a status instead of throwing.
- Keep the HTML report self-contained (no external CSS or JS).
- Formatting and lint come from Biome: run `npm run check:fix` before committing.
- New behavior needs a test. Tests must not use the internet: use the local mock server in `test/helpers.ts` (it has routes for ok, 405-on-HEAD, redirects, 403, 500, dropped connections and hangs).
- Test a change with a real scan too: `npm run build && node dist/cli.js --no-open`, and check the time and reachable count against a run before your change.

## Pull request guidelines

1. **Open an issue first** for anything bigger than a bug fix or a server list change, so we can agree on the approach before you write code.
2. **Branch from `main`**, one topic per pull request. Don't mix server list changes with code changes.
3. **Commit messages** start with a type: `feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`, `servers:` (server list changes). Example: `servers: add 3 Circle Network emby servers`.
4. **Before opening the PR**, all of these must pass (CI runs them on Ubuntu and Windows, Node 20/22/24):

   ```bash
   npm run check
   npm run typecheck
   npm test
   npm run validate:servers
   npm run build
   ```

5. **In the description**, say what changed and why, how you tested it, and for network changes the scan time and reachable count before and after. Fill in the checklist in the PR template.
6. **Update the README** when you add or change a flag, command or output.

### Adding, fixing or removing servers

1. Edit `data/servers.json`. Each entry:

   ```json
   {
     "url": "http://media.ftpbd.net",
     "name": "media.ftpbd.net",
     "provider": "FTPBD",
     "type": "ftp"
   }
   ```

   - `url`: http(s), lowercase host, no trailing slash, not already in the list.
   - `provider`: the ISP or network that runs it, spelled like the existing entries.
   - `type`: `ftp`, `emby`, `jellyfin`, `plex`, `h5ai` or `web`.
2. Bump `version` (`YYYY.MM.DD`, add `.N` for a second change on the same day) and `updatedAt`. Users only get the list through `bd-ftp-checker update` when the version is newer.
3. Run `npm run validate:servers`.
4. Check that the server answers from your connection: `npm run dev -- --add <url> -s <host> --no-open -v`.
5. In the PR, say which ISP you tested from. Only add servers that serve media or files to ISP customers, not ordinary public websites. For removals, say how long the server has been down.

More detail: [CONTRIBUTING.md](CONTRIBUTING.md).

## 🤝 Contributors

<a href="https://github.com/MHNahib/bd-ftp-checker/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=MHNahib/bd-ftp-checker" />
</a>
