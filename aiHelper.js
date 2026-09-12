function extractCode(response) {
  const match = response.match(/```html\s*([\s\S]*?)```/i);
  if (!match) {
    throw new Error("AI did not return valid HTML code block");
  }

  let html = match[1].trim();

  // Remove DOCTYPE, html, body if present
  html = html
    .replace(/<!DOCTYPE[^>]*>/gi, "")
    .replace(/<\/?html[^>]*>/gi, "")
    .replace(/<\/?body[^>]*>/gi, "");

  return html;
}
// function extractCode(response) {
//   if (!response) return "";

//   // ✅ Try to find ```html block
//   const match = response.match(/```html\s*([\s\S]*?)```/i);

//   let html = "";

//   if (match) {
//     html = match[1].trim();
//   } else {
//     // ✅ fallback: try to extract any HTML-like content
//     const fallbackMatch = response.match(/<div[\s\S]*<\/div>/i);

//     if (fallbackMatch) {
//       html = fallbackMatch[0];
//     } else {
//       // ✅ last fallback: return full response
//       html = response;
//     }
//   }

//   // ✅ Clean HTML
//   html = html
//     .replace(/<!DOCTYPE[^>]*>/gi, "")
//     .replace(/<\/?html[^>]*>/gi, "")
//     .replace(/<\/?body[^>]*>/gi, "");

//   return html;
// }

function extractAnalysis(response) {
  const scoreMatch = response.match(/Conversion Score:\s*(\d+)\/100/i);

  let score = null;
  if (scoreMatch) {
    score = scoreMatch[1];
  }

  const analysisMatch = response.split("```html")[0];

  return {
    score,
    analysis: analysisMatch.trim(),
  };
}

function extractIntent(response) {
  const patterns = [
    /INTENT:\s*\[(.*?)\]/i,
    /INTENT:\s*(\w+)/i,
    /Intent\s*[:\-]\s*(\w+)/i,
  ];

  let rawIntent = "general";

  for (let pattern of patterns) {
    const match = response.match(pattern);
    if (match && match[1]) {
      rawIntent = match[1].trim().toLowerCase();
      break;
    }
  }

  // =========================
  // 🔥 ALL CONDITIONS ON rawIntent
  // =========================

  // CASINO
  if (
    rawIntent.includes("casino") ||
    rawIntent.includes("bet") ||
    rawIntent.includes("gambling") ||
    rawIntent.includes("slot") ||
    rawIntent.includes("poker")
  ) {
    return "casino";
  }

  // CRYPTO
  if (
    rawIntent.includes("crypto") ||
    rawIntent.includes("bitcoin") ||
    rawIntent.includes("ethereum") ||
    rawIntent.includes("blockchain") ||
    rawIntent.includes("trading")
  ) {
    return "crypto";
  }

  // INSURANCE
  if (
    rawIntent.includes("insurance") ||
    rawIntent.includes("policy") ||
    rawIntent.includes("coverage")
  ) {
    return "insurance";
  }

  // FINANCE
  if (
    rawIntent.includes("loan") ||
    rawIntent.includes("bank") ||
    rawIntent.includes("finance") ||
    rawIntent.includes("investment") ||
    rawIntent.includes("money")
  ) {
    return "finance";
  }

  // DATING
  if (
    rawIntent.includes("dating") ||
    rawIntent.includes("relationship") ||
    rawIntent.includes("love") ||
    rawIntent.includes("match") ||
    rawIntent.includes("tinder") ||
    rawIntent.includes("girlfriend") ||
    rawIntent.includes("boyfriend") ||
    rawIntent.includes("adult") ||
    rawIntent.includes("xxx") ||
    rawIntent.includes("sex") ||
    rawIntent.includes("porn") ||
    rawIntent.includes("18+")
  ) {
    return "dating";
  }

  // ADULT
  if (
    rawIntent.includes("adult") ||
    rawIntent.includes("xxx") ||
    rawIntent.includes("porn") ||
    rawIntent.includes("18+")
  ) {
    return "adult";
  }

  // SURVEY
  if (
    rawIntent.includes("survey") ||
    rawIntent.includes("quiz") ||
    rawIntent.includes("questionnaire")
  ) {
    return "survey";
  }

  // COUPON
  if (
    rawIntent.includes("coupon") ||
    rawIntent.includes("discount") ||
    rawIntent.includes("promo") ||
    rawIntent.includes("deal") ||
    rawIntent.includes("offer") ||
    rawIntent.includes("gift")
  ) {
    return "coupon";
  }

  // EDUCATION
  if (
    rawIntent.includes("course") ||
    rawIntent.includes("learn") ||
    rawIntent.includes("training") ||
    rawIntent.includes("tutorial") ||
    rawIntent.includes("education")
  ) {
    return "education";
  }

  // JOB
  if (
    rawIntent.includes("job") ||
    rawIntent.includes("career") ||
    rawIntent.includes("hiring") ||
    rawIntent.includes("work") ||
    rawIntent.includes("earn")
  ) {
    return "job";
  }

  // TRAVEL
  if (
    rawIntent.includes("travel") ||
    rawIntent.includes("trip") ||
    rawIntent.includes("flight") ||
    rawIntent.includes("hotel") ||
    rawIntent.includes("tour")
  ) {
    return "travel";
  }

  // GAMING
  if (
    rawIntent.includes("game") ||
    rawIntent.includes("gaming") ||
    rawIntent.includes("play")
  ) {
    return "gaming";
  }

  // DOWNLOAD
  if (
    rawIntent.includes("download") ||
    rawIntent.includes("apk") ||
    rawIntent.includes("install") ||
    rawIntent.includes("file")
  ) {
    return "download";
  }

  // SAAS
  if (
    rawIntent.includes("software") ||
    rawIntent.includes("saas") ||
    rawIntent.includes("tool") ||
    rawIntent.includes("platform") ||
    rawIntent.includes("app")
  ) {
    return "saas";
  }

  // BEAUTY
  if (
    rawIntent.includes("skincare") ||
    rawIntent.includes("cosmetic") ||
    rawIntent.includes("makeup") ||
    rawIntent.includes("beauty")
  ) {
    return "beauty";
  }

  // HEALTH (🔥 weightloss → এখানে convert হবে)
  if (
    rawIntent.includes("weight") ||
    rawIntent.includes("fat") ||
    rawIntent.includes("diet") ||
    rawIntent.includes("fitness") ||
    rawIntent.includes("health") ||
    rawIntent.includes("supplement") ||
    rawIntent.includes("muscle") ||
    rawIntent.includes("wellness")
  ) {
    return "health";
  }

  // ECOMMERCE
  if (
    rawIntent.includes("shop") ||
    rawIntent.includes("store") ||
    rawIntent.includes("product") ||
    rawIntent.includes("buy")
  ) {
    return "ecommerce";
  }

  // DEFAULT
  return rawIntent || "general";
}

module.exports = {
  extractCode,
  extractAnalysis,
  extractIntent,
};
