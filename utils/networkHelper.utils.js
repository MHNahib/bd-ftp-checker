const axios = require("axios");
get = async (url) => {
  return await axios.get(url);
};

module.exports = { get };
