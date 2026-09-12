import { createTikTokSession } from "./session.js";

import { fetchAllTikTokTopAds } from "./api.js";

import { createTikTokDecisionData } from "./tiktokDecisionEngine.js";

import { analyzeTikTokAdsWithAI } from "./tiktokAIAnalyzer.js";


export async function getTikTokAffiliateIntelligence({
  countryCode = "US",
  period = 30,
  limit = 20,
}) {
  let browser;

  try {
    /*
     * STEP 1
     * Create TikTok session
     */

    const session = await createTikTokSession();

    browser = session.browser;

    if (!session.apiHeaders) {
      throw new Error("TikTok API headers were not captured");
    }

    /*
     * STEP 2
     * Fetch ALL available ads
     */

    const result = await fetchAllTikTokTopAds({
      countryCode,

      period,

      limit,

      apiHeaders: session.apiHeaders,
    });

    console.log(`Raw TikTok ads received: ${result.ads.length}`);

    /*
     * STEP 3
     * Decision Engine
     */

    const decisionData = createTikTokDecisionData(result.ads);

    console.log(
      `Decision engine processed: ${decisionData.summary.totalAds} ads`,
    );

    console.log("Top ads:", decisionData.topAds.length);

    /*
     * STEP 4
     * AI Analysis
     */

    const aiIntelligence = await analyzeTikTokAdsWithAI(decisionData);

    console.log(`AI analyzed ${aiIntelligence.analyzedAds} representative ads`);

    /*
     * STEP 5
     * Final result
     */

    return {
      success: true,

      country: countryCode,

      data: {
        summary: decisionData.summary,

        statistics: decisionData.statistics,

        insights: decisionData.insights,

        topAds: decisionData.topAds,

        aiIntelligence,
      },
    };
  } finally {
    /*
     * Always close browser.
     */

    if (browser) {
      await browser.close();
    }
  }
}
