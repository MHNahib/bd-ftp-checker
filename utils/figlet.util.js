const figlet = require("figlet");

const options = {
  font: "Standard",
  horizontalLayout: "default",
  verticalLayout: "default",
  width: 80,
  whitespaceBreak: true,
};

const generateFiglet = async (text) =>
  await figlet(text, options, function (err, data) {
    if (err) {
      console.log("Something went wrong...");
      console.dir(err);
      return;
    }
    return data;
  });

module.exports = { generateFiglet };
