#!/usr/bin/env node

const { servers } = require("./asset");
const { generateFiglet, get } = require("./utils");

async function checkAllServers() {
  for (const [index, server] of servers.entries()) {
    const text = `[${index + 1} / ${servers?.length}]`;

    process.stdout.write(`Checking ${index + 1}/${servers.length}...`);
    try {
      const response = await get(server);
      process.stdout.clearLine();
      process.stdout.cursorTo(0);
      console.log(
        `${text} - ${response.status === 200 ? "✅" : "❌"} : ${server}`
      );
    } catch (error) {
      process.stdout.clearLine();
      process.stdout.cursorTo(0);
      console.log(`${text} - ❌ : ${server}`);
    }
  }
}

const main = async () => {
  const figlet = await generateFiglet("BD FTP Checker");
  console.log(figlet);
  console.log("- M. H. Nahib\n\n\n");

  await checkAllServers();
};

main();
