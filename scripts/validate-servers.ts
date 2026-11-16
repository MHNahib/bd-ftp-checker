/** npm run validate:servers [-- path] — schema, normalisation and duplicate check for the server list. */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { validateServerList } from "../src/servers/validate.js";

const file = resolve(process.argv[2] ?? "data/servers.json");
const data = JSON.parse(readFileSync(file, "utf8")) as unknown;
const errors = validateServerList(data);

if (errors.length) {
  console.error(`✖ ${file}: ${errors.length} problem(s)`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
const count = (data as { servers: unknown[] }).servers.length;
console.log(`✔ ${file}: ${count} servers, valid`);
