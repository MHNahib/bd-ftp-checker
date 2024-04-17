const fs = require("fs");
const { exec } = require("child_process");

module.exports = generateHtml = (results) => {
  const sortedResults = results?.sort((a, b) => b.success - a.success);
  const htmlContent = [];
  htmlContent.push(
    "<html><head><title>Server Check Results</title></head><body>"
  );
  htmlContent.push("<h1>BD FTP Server Check Results</h1>");
  htmlContent.push(
    "<h3>Developed by <a href='https://www.linkedin.com/in/mhnahib/'>M. H. Nahib</a></h3>"
  );
  for (const result of sortedResults) {
    const { index, success, server } = result;
    htmlContent.push(
      `<p>${
        success ? "✅" : "❌"
      } : <a href=' ${server}' target="_blank"> ${server} </a></p>`
    );
  }

  htmlContent.push("</body></html>");

  const htmlFilePath = "server_check_results.html";

  fs.writeFile(htmlFilePath, htmlContent.join(""), (err) => {
    if (err) throw err;
    console.log(`HTML results saved to ${htmlFilePath}`);
    exec(`start ${htmlFilePath}`, (error, stdout, stderr) => {
      if (error) {
        console.error(`exec error: ${error}`);
        return;
      }
      console.log(`\n\nGenerating Report !!!\n\n`);
    });
  });
};
