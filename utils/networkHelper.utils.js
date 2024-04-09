const axios = require("axios");
const get = async (url) => {
  return await axios.head(url);
};

module.exports = { get };
