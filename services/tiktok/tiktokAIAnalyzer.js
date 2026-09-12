// import { GoogleGenAI } from "@google/genai";
// import {
//   selectTikTokAICandidates,
//   prepareAdsForAI,
// } from "./tiktokAICandidateSelector.js";
// import { buildTikTokAIPrompt } from "./tiktokAIPrompt.js";
// const ai = new GoogleGenAI({
//   apiKey: process.env.GEMINI_API_KEY,
// });
// export async function analyzeTikTokAdsWithAI(decisionData) {
//   if (!decisionData?.ads || !decisionData.ads.length) {
//     throw new Error("No TikTok ads available for AI analysis");
//   }

//   /*
//    * Select only representative ads.
//    */

//   const selectedAds = selectTikTokAICandidates(decisionData, {
//     maxCandidates: 12,
//   });

//   if (!selectedAds.length) {
//     throw new Error("No AI candidates selected");
//   }

//   /*
//    * Prepare compact AI dataset.
//    */

//   const aiAds = prepareAdsForAI(selectedAds);

//   /*
//    * Build prompt.
//    */

//   const prompt = buildTikTokAIPrompt({
//     candidates: aiAds,

//     statistics: decisionData.statistics,

//     insights: decisionData.insights,
//   });

//   /*
//    * Gemini request.
//    */

//   const response = await ai.models.generateContent({
//     model: "gemini-2.5-flash",

//     contents: prompt,

//     config: {
//       responseMimeType: "application/json",
//     },
//   });

//   const text = response?.text?.trim();

//   if (!text) {
//     throw new Error("Gemini returned empty response");
//   }

//   let analysis;

//   try {
//     analysis = JSON.parse(text);
//   } catch (error) {
//     console.error("Gemini invalid JSON:", text);

//     throw new Error("Gemini returned invalid JSON");
//   }

//   return {
//     analyzedAds: selectedAds.length,

//     candidateIds: selectedAds.map((ad) => ad.id),

//     analysis,
//   };
// }



import { GoogleGenAI } from "@google/genai";
import {
  selectTikTokAICandidates,
  prepareAdsForAI,
} from "./tiktokAICandidateSelector.js";

import { buildTikTokAIPrompt } from "./tiktokAIPrompt.js";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

/**
 * Analyze selected TikTok ads with Gemini.
 */
export const analyzeTikTokAdsWithAI = async (decisionData) => {
  /**
   * Step 1:
   * Select representative ads.
   *
   * Example:
   * 178 ads → 12 ads
   */
  const selectedAds = selectTikTokAICandidates(decisionData, {
    topPerformance: 5,
    topCTR: 3,
    topLikes: 2,
    maxCandidates: 12,
  });

  if (!selectedAds.length) {
    return {
      analyzedAds: 0,
      analysis: null,
      message: "No TikTok ads available for AI analysis.",
    };
  }

  console.log(`AI candidate ads: ${selectedAds.length}`);

  /**
   * Step 2:
   * Remove unnecessary TikTok data.
   *
   * Video URLs, covers etc. are NOT sent.
   */
  const aiAds = prepareAdsForAI(selectedAds);

  /**
   * Step 3:
   * Build AI prompt.
   */
  const prompt = buildTikTokAIPrompt({
    candidates: aiAds,

    statistics: decisionData?.statistics || {},

    insights: decisionData?.insights || {},
  });

  /**
   * Step 4:
   * Call Gemini.
   */
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",

    contents: prompt,

    config: {
      responseMimeType: "application/json",
    },
  });

  const text =
    typeof response?.text === "function" ? response.text() : response?.text;

  if (!text) {
    throw new Error("Gemini returned an empty response.");
  }

  /**
   * Step 5:
   * Parse JSON.
   */
  let analysis;

  try {
    analysis = JSON.parse(text);
  } catch (error) {
    console.error("Gemini invalid JSON:", text);

    throw new Error("Gemini returned invalid JSON.");
  }

  /**
   * Step 6:
   * Return AI intelligence.
   */
  return {
    analyzedAds: selectedAds.length,

    candidateIds: selectedAds.map((ad) => ad.id),

    analysis,
  };
};
