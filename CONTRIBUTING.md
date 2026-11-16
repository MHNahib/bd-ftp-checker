# Contributing

## Adding or fixing a server

1. Edit `data/servers.json`. Each entry looks like this:

   ```json
   {
     "url": "http://media.ftpbd.net",
     "name": "media.ftpbd.net",
     "provider": "FTPBD",
     "type": "ftp"
   }
   ```

   - `url`: http(s) URL, no trailing slash, no duplicates.
   - `provider`: the ISP or network that hosts it. Use the same spelling as the existing entries.
   - `type`: one of `ftp`, `emby`, `jellyfin`, `plex`, `h5ai`, `web`.

2. Bump `version` (format `YYYY.MM.DD`, add `.N` for a second change on the same day) and `updatedAt`. Users who run `bd-ftp-checker update` only receive lists with a newer version.

3. Check the file:

   ```bash
   npm ci
   npm run validate:servers
   ```

4. Confirm the server works: `npx tsx src/cli.ts --add <url> -s <host>`.

5. Open a pull request. Say which ISP you tested from.

Only add servers that serve media or files to an ISP's customers. Do not add general public websites.

## Working on the code

```bash
npm ci
npm run dev -- --help     # run the CLI from source
npm test                  # vitest
npm run typecheck
npm run check             # biome lint + format (npm run check:fix to fix)
npm run build             # dist/
```

Tests use a local mock HTTP server and do not need internet access.
