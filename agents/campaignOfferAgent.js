
const marketResearchService = require("../services/marketResearchService")
async function campaignOfferAgent(country , offerCacheCollection) {
  try {
    const result = await marketResearchService(country , offerCacheCollection);
    return result;
  } catch (error) {
    console.error("Campaign Offer Agent Error:", error);
    throw error;
  }
}

module.exports = campaignOfferAgent;
