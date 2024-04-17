#!/usr/bin/env node

const { servers } = require("./asset");
const { generateFiglet, get, generateHtml } = require("./utils");

const didRequestSucceed = (reason) =>
  typeof reason === "number" && reason >= 200 && reason < 300;

async function checkAllServers() {
  const requests = servers.map(async (server, index) => {
    try {
      const { status } = await get(server);

      console.log(`\x1b[32m✅ : ${server} ${status}\x1b[0m`);
      return { index, success: true, server };
    } catch (error) {
      const reason = error.response?.status || error.code;

      console.log(`\x1b[31m❌ : ${server} ${reason}\x1b[0m`);

      return { index, success: didRequestSucceed(reason), server };
    }
  });

  const results = await Promise.allSettled(requests);
  const _results = results?.map((result) => result?.value);
  generateHtml(_results);
}

const main = async () => {
  console.log("\n\n\n");
  const figlet = await generateFiglet("BD FTP Checker");
  console.log(figlet);
  console.log("- M. H. Nahib\n\n\n");

  await checkAllServers();
};

main();
