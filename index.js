#!/usr/bin/env node

const { servers } = require("./asset");
const { generateFiglet, get, generateHtml } = require("./utils");

async function checkAllServers() {
  const requests = servers.map(async (server, index) => {
    try {
      const response = await get(server);

      console.log(`\x1b[32m✅ : ${server} 200\x1b[0m`);
      return { index, status: response.status, server };
    } catch (error) {
      console.log(`\x1b[31m❌ : ${server} 500\x1b[0m`);

      return { index, status: 500, server };
    }
  });

  const results = await Promise.allSettled(requests);
  generateHtml(results);
}

const main = async () => {
  console.log("\n\n\n");
  const figlet = await generateFiglet("BD FTP Checker");
  console.log(figlet);
  console.log("- M. H. Nahib\n\n\n");

  await checkAllServers();
};

main();
