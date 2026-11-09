require("dotenv").config();
const express = require("express");
const path = require("path");
const cors = require("cors");
const axios = require("axios");
const cheerio = require("cheerio");
const puppeteer = require("puppeteer");
// const { ApifyClient } = require("apify-client");
const { GoogleGenAI } = require("@google/genai");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const crypto = require("crypto");
const learningEngine = require("./services/learningEngine");
const vectorSearch = require("./services/vectorSearch");
const buildRagContext = require("./services/ragEngine");
const createEmbedding = require("./services/embeddingService");
const {
  scrapeAmazonProducts,
} = require("./services/amazon/amazonProduct.service");
const { createTikTokSession } = require("./services/tiktok/session");
const {
  createTikTokDecisionData,
} = require("./services/tiktok/tiktokDecisionEngine.js");
const { fetchAllTikTokTopAds } = require("./services/tiktok/api.js");
const {
  analyzeTikTokAdsWithAI,
} = require("./services/tiktok/tiktokAIAnalyzer.js");

const {
  getPrompt,
  getVariationPrompt,
  chatPrompt,
  socialMediaPrompt,
  buildPrompt,
} = require("./prompt");
const { extractCode, extractAnalysis, extractIntent } = require("./aiHelper");

const app = express();
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://localhost:5174",
      "https://app.affilai.com",
    ],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);
app.use(express.json());

app.use("/images", express.static(path.join(__dirname, "public/images")));

/* =========================================================
   LANDING PAGE DEPLOYMENT HELPERS
========================================================= */

const MAX_LANDING_HTML_SIZE = 2 * 1024 * 1024; // 2 MB

function slugify(value = "") {
  return String(value)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

function generateRandomSlug() {
  return crypto.randomBytes(5).toString("hex");
}

function createLandingSlug(name = "landing-page") {
  const base = slugify(name) || "landing-page";
  return `${base}-${generateRandomSlug()}`;
}

function isValidHttpUrl(value) {
  try {
    const url = new URL(value);

    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function escapeHtmlAttribute(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/'/g, "&#039;");
}

function prepareLandingHTML(html, affiliateLink) {
  if (!html || typeof html !== "string") {
    throw new Error("Invalid landing page HTML");
  }

  if (Buffer.byteLength(html, "utf8") > MAX_LANDING_HTML_SIZE) {
    throw new Error("Landing page HTML is too large");
  }

  let finalHTML = html;

  // Replace affiliate link placeholder
  if (affiliateLink) {
    finalHTML = finalHTML.replaceAll(
      "{{AFFILIATE_LINK}}",
      escapeHtmlAttribute(affiliateLink),
    );
  }

  // Prevent accidental unresolved placeholder
  finalHTML = finalHTML.replaceAll("{{AFFILIATE_LINK}}", "#");

  return finalHTML;
}

/* =========================================================
   INJECT AFFILIATE TRACKER
========================================================= */

function injectTrackingScript(
  html,
  { campaignId = "", landingPageId = "", affiliateLink = "" } = {},
) {
  if (!html || typeof html !== "string") {
    return html;
  }

  const apiBaseUrl = process.env.PUBLIC_BASE_URL || "http://localhost:5000";

  const cleanApiBaseUrl = apiBaseUrl.replace(/\/$/, "");

  const trackingScript = `
<script>
(function () {
  "use strict";

  try {
   const API_BASE_URL = ${JSON.stringify(cleanApiBaseUrl)};

  const DEFAULT_CAMPAIGN_ID = ${JSON.stringify(campaignId)};

  const LANDING_PAGE_ID = ${JSON.stringify(landingPageId)};

  const AFFILIATE_LINK = ${JSON.stringify(affiliateLink)};

  const REDIRECT_PATH = "/api/tracking/redirect";

  let clickRequestPromise = null;
  let redirectInProgress = false;

  // Read campaign ID dynamically from URL

  const params = new URLSearchParams(window.location.search);

const CAMPAIGN_ID =
  params.get("campaignId") || DEFAULT_CAMPAIGN_ID;

    const trackingParams = {
      utm_source: params.get("utm_source"),
      utm_medium: params.get("utm_medium"),
      utm_campaign: params.get("utm_campaign"),
      utm_term: params.get("utm_term"),
      utm_content: params.get("utm_content"),
      fbclid: params.get("fbclid"),
      gclid: params.get("gclid"),
      ttclid: params.get("ttclid")
    };

    // -----------------------------------
    // 1. Create tracking click
    // -----------------------------------

    function createTrackingClick() {
      const trackingUrl = new URL(
        API_BASE_URL + "/api/tracking/click"
      );

      if (CAMPAIGN_ID) {
        trackingUrl.searchParams.set("campaignId", CAMPAIGN_ID);
      }

      if (LANDING_PAGE_ID) {
        trackingUrl.searchParams.set("landingPageId", LANDING_PAGE_ID);
      }

      Object.entries(trackingParams).forEach(([key, value]) => {
        if (value) {
          trackingUrl.searchParams.set(key, value);
        }
      });

      return fetch(trackingUrl.toString(), {
        method: "GET",
        credentials: "include",
        cache: "no-store"
      })
        .then((response) => {
          if (!response.ok) {
            throw new Error(
              "Tracking API failed: " + response.status
            );
          }

          return response.json();
        })
        .then((data) => {
          if (!data || !data.success || !data.clickId) {
            throw new Error("Invalid tracking response");
          }

          // Store the latest click ID for debugging.
          localStorage.setItem(
            "affilai_click_id",
            data.clickId
          );

          localStorage.setItem(
            "affilai_landing_page_id",
            LANDING_PAGE_ID
          );

          if (CAMPAIGN_ID) {
            localStorage.setItem(
              "affilai_campaign_id",
              CAMPAIGN_ID
            );
          }

          console.log(
            "AffilAI: Tracking click created",
            data.clickId
          );

          return data.clickId;
        });
    }

    // Create a new click ID for this page visit.
    clickRequestPromise = createTrackingClick();

    // -----------------------------------
    // 2. Check affiliate link
    // -----------------------------------

    function isAffiliateLink(element) {
      if (!element || !AFFILIATE_LINK) {
        return false;
      }

      const href = element.getAttribute("href");

      if (!href) {
        return false;
      }

      try {
        const clickedUrl = new URL(
          href,
          window.location.href
        );

        const affiliateUrl = new URL(
          AFFILIATE_LINK,
          window.location.href
        );

        return (
          clickedUrl.origin === affiliateUrl.origin &&
          clickedUrl.pathname === affiliateUrl.pathname
        );
      } catch (error) {
        console.error(
          "AffilAI: Invalid affiliate URL",
          error
        );

        return false;
      }
    }

    // -----------------------------------
    // 3. Handle affiliate CTA click
    // -----------------------------------

    document.addEventListener(
      "click",
      function (event) {
        const target = event.target;

        const link =
          target && target.closest
            ? target.closest("a")
            : null;

        if (!link) {
          return;
        }

        if (redirectInProgress) {
          event.preventDefault();
          return;
        }

        if (!isAffiliateLink(link)) {
          console.log(
            "AffilAI: Clicked link is not the configured affiliate link",
            {
              clickedHref: link.href,
              configuredAffiliateLink: AFFILIATE_LINK
            }
          );

          return;
        }

        // Stop normal navigation.
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        redirectInProgress = true;

        console.log(
          "AffilAI: Affiliate CTA detected",
          link.href
        );

        // IMPORTANT:
        // Always use the current page visit's click ID.
        // Do not use an old ID from localStorage.
        clickRequestPromise
          .then((clickId) => {
            if (!clickId) {
              throw new Error("Missing click ID");
            }

            const redirectUrl = new URL(
              API_BASE_URL + REDIRECT_PATH
            );

            redirectUrl.searchParams.set(
              "clickId",
              clickId
            );

            console.log(
              "AffilAI: Redirecting through tracking API",
              redirectUrl.toString()
            );

            window.location.assign(
              redirectUrl.toString()
            );
          })
          .catch((error) => {
            console.error(
              "AffilAI: Tracking redirect failed",
              error
            );

            // Fallback to original affiliate URL.
            window.location.assign(link.href);
          });
      },
      true
    );

    console.log("AffilAI: Tracking script initialized", {
      campaignId: CAMPAIGN_ID,
      landingPageId: LANDING_PAGE_ID,
      affiliateLink: AFFILIATE_LINK
    });

  } catch (error) {
    console.error(
      "AffilAI: Tracking script initialization failed",
      error
    );
  }
})();
</script>
`;

  if (html.includes("</body>")) {
    return html.replace("</body>", trackingScript + "\n</body>");
  }

  return html + trackingScript;
}

// function injectTrackingScript(
//   html,
//   { campaignId = "", landingPageId = "", affiliateLink = "" } = {},
// ) {
//   if (!html || typeof html !== "string") {
//     return html;
//   }

//   const apiBaseUrl = process.env.PUBLIC_BASE_URL || "http://localhost:5000";

//   const cleanApiBaseUrl = apiBaseUrl.replace(/\/$/, "");

//   const trackingScript = `
// <script>
// (function () {
//   "use strict";

//   try {
//     const API_BASE_URL = ${JSON.stringify(cleanApiBaseUrl)};
//     const CAMPAIGN_ID = ${JSON.stringify(campaignId)};
//     const LANDING_PAGE_ID = ${JSON.stringify(landingPageId)};
//     const AFFILIATE_LINK = ${JSON.stringify(affiliateLink)};

//     const REDIRECT_PATH = "/api/tracking/redirect";

//     let clickRequestPromise = null;
//     let redirectInProgress = false;

//     const params = new URLSearchParams(window.location.search);

//     const trackingParams = {
//       utm_source: params.get("utm_source"),
//       utm_medium: params.get("utm_medium"),
//       utm_campaign: params.get("utm_campaign"),
//       utm_term: params.get("utm_term"),
//       utm_content: params.get("utm_content"),
//       fbclid: params.get("fbclid"),
//       gclid: params.get("gclid"),
//       ttclid: params.get("ttclid")
//     };

//     // -----------------------------------
//     // 1. Create tracking click
//     // -----------------------------------

//     function createTrackingClick() {
//       const trackingUrl = new URL(
//         API_BASE_URL + "/api/tracking/click"
//       );

//       if (CAMPAIGN_ID) {
//         trackingUrl.searchParams.set("campaignId", CAMPAIGN_ID);
//       }

//       if (LANDING_PAGE_ID) {
//         trackingUrl.searchParams.set("landingPageId", LANDING_PAGE_ID);
//       }

//       Object.entries(trackingParams).forEach(([key, value]) => {
//         if (value) {
//           trackingUrl.searchParams.set(key, value);
//         }
//       });

//       return fetch(trackingUrl.toString(), {
//         method: "GET",
//         credentials: "include",
//         cache: "no-store"
//       })
//         .then((response) => {
//           if (!response.ok) {
//             throw new Error(
//               "Tracking API failed: " + response.status
//             );
//           }

//           return response.json();
//         })
//         .then((data) => {
//           if (!data || !data.success || !data.clickId) {
//             throw new Error("Invalid tracking response");
//           }

//           // Store the latest click ID for debugging.
//           localStorage.setItem(
//             "affilai_click_id",
//             data.clickId
//           );

//           localStorage.setItem(
//             "affilai_landing_page_id",
//             LANDING_PAGE_ID
//           );

//           if (CAMPAIGN_ID) {
//             localStorage.setItem(
//               "affilai_campaign_id",
//               CAMPAIGN_ID
//             );
//           }

//           console.log(
//             "AffilAI: Tracking click created",
//             data.clickId
//           );

//           return data.clickId;
//         });
//     }

//     // Create a new click ID for this page visit.
//     clickRequestPromise = createTrackingClick();

//     // -----------------------------------
//     // 2. Check affiliate link
//     // -----------------------------------

//     function isAffiliateLink(element) {
//       if (!element || !AFFILIATE_LINK) {
//         return false;
//       }

//       const href = element.getAttribute("href");

//       if (!href) {
//         return false;
//       }

//       try {
//         const clickedUrl = new URL(
//           href,
//           window.location.href
//         );

//         const affiliateUrl = new URL(
//           AFFILIATE_LINK,
//           window.location.href
//         );

//         return (
//           clickedUrl.origin === affiliateUrl.origin &&
//           clickedUrl.pathname === affiliateUrl.pathname
//         );
//       } catch (error) {
//         console.error(
//           "AffilAI: Invalid affiliate URL",
//           error
//         );

//         return false;
//       }
//     }

//     // -----------------------------------
//     // 3. Handle affiliate CTA click
//     // -----------------------------------

//     document.addEventListener(
//       "click",
//       function (event) {
//         const target = event.target;

//         const link =
//           target && target.closest
//             ? target.closest("a")
//             : null;

//         if (!link) {
//           return;
//         }

//         if (redirectInProgress) {
//           event.preventDefault();
//           return;
//         }

//         if (!isAffiliateLink(link)) {
//           console.log(
//             "AffilAI: Clicked link is not the configured affiliate link",
//             {
//               clickedHref: link.href,
//               configuredAffiliateLink: AFFILIATE_LINK
//             }
//           );

//           return;
//         }

//         // Stop normal navigation.
//         event.preventDefault();
//         event.stopPropagation();
//         event.stopImmediatePropagation();

//         redirectInProgress = true;

//         console.log(
//           "AffilAI: Affiliate CTA detected",
//           link.href
//         );

//         // IMPORTANT:
//         // Always use the current page visit's click ID.
//         // Do not use an old ID from localStorage.
//         clickRequestPromise
//           .then((clickId) => {
//             if (!clickId) {
//               throw new Error("Missing click ID");
//             }

//             const redirectUrl = new URL(
//               API_BASE_URL + REDIRECT_PATH
//             );

//             redirectUrl.searchParams.set(
//               "clickId",
//               clickId
//             );

//             console.log(
//               "AffilAI: Redirecting through tracking API",
//               redirectUrl.toString()
//             );

//             window.location.assign(
//               redirectUrl.toString()
//             );
//           })
//           .catch((error) => {
//             console.error(
//               "AffilAI: Tracking redirect failed",
//               error
//             );

//             // Fallback to original affiliate URL.
//             window.location.assign(link.href);
//           });
//       },
//       true
//     );

//     console.log("AffilAI: Tracking script initialized", {
//       campaignId: CAMPAIGN_ID,
//       landingPageId: LANDING_PAGE_ID,
//       affiliateLink: AFFILIATE_LINK
//     });

//   } catch (error) {
//     console.error(
//       "AffilAI: Tracking script initialization failed",
//       error
//     );
//   }
// })();
// </script>
// `;

//   if (html.includes("</body>")) {
//     return html.replace("</body>", trackingScript + "\n</body>");
//   }

//   return html + trackingScript;
// }

function makeImageUrlsAbsolute(html) {
  if (!html || typeof html !== "string") {
    return html;
  }

  const assetBaseURL = process.env.ASSET_BASE_URL || "http://localhost:5173";

  const cleanAssetBaseURL = assetBaseURL.replace(/\/$/, "");

  return html.replace(
    /(<img\b[^>]*\bsrc\s*=\s*["'])([^"']+)(["'])/gi,
    (match, prefix, src, suffix) => {
      // ---------------------------------------------
      // Already absolute URL
      // ---------------------------------------------
      if (
        src.startsWith("http://") ||
        src.startsWith("https://") ||
        src.startsWith("data:") ||
        src.startsWith("blob:")
      ) {
        return match;
      }

      // ---------------------------------------------
      // Root-relative URL
      // /images/insurance/1.png
      // ---------------------------------------------
      if (src.startsWith("/")) {
        return `${prefix}${cleanAssetBaseURL}${src}${suffix}`;
      }

      // ---------------------------------------------
      // Relative URL
      // images/insurance/1.png
      // ---------------------------------------------
      return `${prefix}${cleanAssetBaseURL}/${src}${suffix}`;
    },
  );
}

// =====================================================
// CREATE PUBLIC LANDING PAGE SLUG
// Example:
// insurance-117bc58e2a
// finance-a82f91c321
// travel-91ab72cd10
// =====================================================

function createPublicLandingSlug(intent = "") {
  const cleanIntent =
    typeof intent === "string"
      ? intent
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "")
          .slice(0, 40)
      : "";

  // If intent is missing
  const prefix = cleanIntent || "landing";

  // 10-character unique hexadecimal ID
  const uniqueId = crypto.randomBytes(5).toString("hex");

  return `${prefix}-${uniqueId}`;
}

/* =========================================================
   AFFILIATE TRACKING HELPERS
========================================================= */

function generateTrackingClickId() {
  return `cl_${crypto.randomBytes(16).toString("hex")}`;
}

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];

  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }

  return req.headers["x-real-ip"] || req.socket?.remoteAddress || null;
}

function detectDevice(userAgent = "") {
  const ua = userAgent.toLowerCase();

  if (/tablet|ipad|playbook|silk/.test(ua)) {
    return "tablet";
  }

  if (
    /mobile|iphone|ipod|android|blackberry|opera mini|windows phone/.test(ua)
  ) {
    return "mobile";
  }

  return "desktop";
}

function detectBrowser(userAgent = "") {
  const ua = userAgent.toLowerCase();

  if (ua.includes("edg/")) {
    return "Edge";
  }

  if (ua.includes("opr/") || ua.includes("opera")) {
    return "Opera";
  }

  if (ua.includes("chrome") && !ua.includes("edg")) {
    return "Chrome";
  }

  if (ua.includes("firefox")) {
    return "Firefox";
  }

  if (ua.includes("safari") && !ua.includes("chrome")) {
    return "Safari";
  }

  return "Unknown";
}

function detectOS(userAgent = "") {
  const ua = userAgent.toLowerCase();

  if (ua.includes("windows")) {
    return "Windows";
  }

  if (ua.includes("iphone") || ua.includes("ipad")) {
    return "iOS";
  }

  if (ua.includes("mac os")) {
    return "macOS";
  }

  if (ua.includes("android")) {
    return "Android";
  }

  if (ua.includes("linux")) {
    return "Linux";
  }

  return "Unknown";
}

// =========================================================
// AFFILIATE REDIRECT / TRACKING HELPERS
// =========================================================

const DEFAULT_AFFILIATE_TRACKING_PARAMETER = "aff_sub";

const ALLOWED_AFFILIATE_TRACKING_PARAMETERS = new Set([
  "aff_sub",
  "subid",
  "sub_id",
  "click_id",
  "clickid",
  "cid",
  "s1",
  "s2",
  "s3",
  "s4",
  "s5",
]);

function normalizeTrackingParameter(value) {
  const parameter = String(value || DEFAULT_AFFILIATE_TRACKING_PARAMETER)
    .trim()
    .toLowerCase();

  if (!ALLOWED_AFFILIATE_TRACKING_PARAMETERS.has(parameter)) {
    return DEFAULT_AFFILIATE_TRACKING_PARAMETER;
  }

  return parameter;
}

function buildAffiliateTrackingUrl({
  affiliateLink,
  clickId,
  trackingParameter,
}) {
  if (!affiliateLink || !clickId || !isValidHttpUrl(affiliateLink)) {
    return null;
  }

  const parameter = normalizeTrackingParameter(trackingParameter);

  try {
    const url = new URL(affiliateLink);

    // Add/replace the AffilAI click ID.
    // URLSearchParams handles existing query parameters safely.
    url.searchParams.set(parameter, clickId);

    return url.toString();
  } catch (error) {
    console.error("❌ AFFILIATE URL BUILD ERROR:", error);

    return null;
  }
}

// =========================================================
// AFFILIATE REDIRECT / TRACKING HELPERS
// =========================================================

// const DEFAULT_AFFILIATE_TRACKING_PARAMETER = "aff_sub";

// const ALLOWED_AFFILIATE_TRACKING_PARAMETERS = new Set([
//   "aff_sub",
//   "subid",
//   "sub_id",
//   "click_id",
//   "clickid",
//   "cid",
//   "s1",
//   "s2",
//   "s3",
//   "s4",
//   "s5",
// ]);

// function normalizeTrackingParameter(value) {
//   const parameter = String(value || DEFAULT_AFFILIATE_TRACKING_PARAMETER)
//     .trim()
//     .toLowerCase();

//   if (!ALLOWED_AFFILIATE_TRACKING_PARAMETERS.has(parameter)) {
//     return DEFAULT_AFFILIATE_TRACKING_PARAMETER;
//   }

//   return parameter;
// }

// function buildAffiliateTrackingUrl({
//   affiliateLink,
//   clickId,
//   trackingParameter,
// }) {
//   if (!affiliateLink || !clickId || !isValidHttpUrl(affiliateLink)) {
//     return null;
//   }

//   const parameter = normalizeTrackingParameter(trackingParameter);

//   try {
//     const url = new URL(affiliateLink);

//     // Add/replace the AffilAI click ID.
//     // URLSearchParams handles existing query parameters safely.
//     url.searchParams.set(parameter, clickId);

//     return url.toString();
//   } catch (error) {
//     console.error("❌ AFFILIATE URL BUILD ERROR:", error);

//     return null;
//   }
// }

/* =========================================================
   AI setup 
   ========================================================= */

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const safeJSON = (text) => {
  try {
    if (!text || typeof text !== "string") return null;

    const cleanedText = text
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    const match = cleanedText.match(/\{[\s\S]*\}/);

    if (!match) return null;

    const cleaned = match[0].replace(/,\s*}/g, "}").replace(/,\s*]/g, "]");

    return JSON.parse(cleaned);
  } catch (err) {
    console.log("❌ SAFE JSON ERROR:", err.message);
    return null;
  }
};

const detectUrlType = (url) => {
  if (!url) return "unknown";

  if (url.includes("facebook.com/ads/library")) {
    return "facebook_ads";
  }

  if (
    url.includes("http") &&
    (url.includes("http://") || url.includes("https://"))
  ) {
    return "landing_page";
  }

  return "unknown";
};

const isFollowUpPrompt = (text = "") => {
  const p = text.toLowerCase().trim();

  const keywords = [
    "again",

    "more",

    "generate more",

    "rewrite",

    "improve",

    "better",

    "variation",

    "another",

    "shorter",

    "longer",

    "more attractive",

    "more emotional",

    "more persuasive",

    "curiosity",

    "cta",

    "headline",

    "headlines",

    "description",

    "primary text",

    "caption",

    "script",

    "replace",

    "regenerate",

    "expand",

    "improve ctr",

    "make it stronger",

    "make it professional",

    "convert",

    "continue",

    "same product",

    "same business",
  ];

  return keywords.some((word) => p.includes(word));
};

const stringifyContent = (content) => {
  if (!content) return "";

  if (typeof content === "string") {
    return content;
  }

  try {
    return JSON.stringify(content, null, 2);
  } catch {
    return String(content);
  }
};

const detectInputType = (input = "") => {
  const text = input.toLowerCase();

  // Facebook Ads Library
  if (text.includes("facebook.com/ads/library")) {
    return "facebook_ads";
  }

  // Any website / landing page
  if (text.startsWith("http://") || text.startsWith("https://")) {
    return "landing_page";
  }

  // Default = marketing question
  return "marketing_question";
};

const detectResponseMode = ({ prompt, url }) => {
  const hasUrl = !!url;
  const hasPrompt = !!prompt?.trim();

  if (hasUrl && hasPrompt) {
    return "chat";
  }

  if (hasUrl) {
    return "analysis";
  }

  return "chat";

  // if (hasUrl) {
  //   return "analysis";
  // }

  // if (hasUrl && hasPrompt) {
  //   return "hybrid";
  // }

  // const createWords = [
  //   "generate",
  //   "create",
  //   "write",
  //   "give",
  //   "make",
  //   "suggest",
  //   "hook",
  //   "headline",
  //   "caption",
  //   "script",
  //   "cta",
  //   "copy",
  //   "email",
  //   "ad",
  // ];

  // const isCreate = createWords.some((word) =>
  //   prompt?.toLowerCase().includes(word),
  // );

  // if (isCreate) {
  //   return "chat";
  // }

  // return "chat";
};

const scrapeLandingPage = async (url) => {
  let browser;

  try {
    browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();

    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64)");

    await page.goto(url, {
      waitUntil: "networkidle2",
      timeout: 60000,
    });

    await sleep(5000);

    const data = await page.evaluate(() => {
      const getText = (selector) =>
        Array.from(document.querySelectorAll(selector))
          .map((el) => el.innerText.trim())
          .filter(Boolean);

      return {
        title: document.title,

        description:
          document
            .querySelector('meta[name="description"]')
            ?.getAttribute("content") || "",

        headings: getText("h1,h2,h3"),

        paragraphs: getText("p"),

        buttons: getText("button,a"),

        images: Array.from(document.images)
          .map((img) => img.src)
          .slice(0, 10),

        forms: document.querySelectorAll("form").length,

        priceTexts: Array.from(document.body.innerText.match(/\$\d+/g) || []),

        fullText: document.body.innerText.slice(0, 4000),
      };
    });

    return {
      type: "landing",
      ...data,
    };
  } catch (err) {
    console.log(err);

    return {
      type: "landing",
      error: true,
      url,
    };
  } finally {
    if (browser) await browser.close();
  }
};

const scrapeWithPuppeteer = async (url) => {
  let browser;

  try {
    browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();

    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64)");

    await page.goto(url, {
      waitUntil: "networkidle2",
      timeout: 90000,
    });

    await sleep(8000);

    const data = await page.evaluate(() => {
      const bodyText = document.body.innerText || "";

      const lines = bodyText
        .split("\n")
        .map((t) => t.trim())
        .filter(Boolean);

      const headline = lines.find((t) => t.length > 20 && t.length < 120) || "";

      const possibleCTA = [
        "Learn More",
        "Shop Now",
        "Sign Up",
        "Download",
        "Apply Now",
        "Get Offer",
      ];

      const cta = possibleCTA.find((c) => bodyText.includes(c)) || "";

      return {
        advertiser: lines[0] || "Unknown",

        headline,

        adText: bodyText.slice(0, 5000),

        cta,
      };
    });

    return {
      type: "facebook_ads",
      ads: [data],
    };
  } catch (err) {
    console.log(err);

    return null;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
};

const fallbackFacebook = (url) => {
  const adId = url.match(/id=(\d+)/)?.[1] || "";

  return {
    type: "facebook_ads",
    ads: [
      {
        advertiser: "Unknown",
        headline: `Facebook Ad ${adId}`,
        adText:
          "AI should infer likely ad intent and generate competitor-style ads based on Facebook Ads Library URL.",
        cta: "Learn More",
        platform: "fallback",
      },
    ],
  };
};

const scrapeFacebookAds = async (url) => {
  // Puppeteer
  const puppeteerData = await scrapeWithPuppeteer(url);

  if (puppeteerData) {
    console.log("✅ Puppeteer success");
    return puppeteerData;
  }

  return fallbackFacebook(url);
};

const fallbackAnalyze = (url) => ({
  type: "fallback",
  url,
});

const getScrapedData = async (url) => {
  const type = detectUrlType(url);

  if (type === "facebook_ads") {
    return await scrapeFacebookAds(url);
  }

  if (type === "landing_page") {
    return await scrapeLandingPage(url);
  }

  return fallbackAnalyze(url);
};

/* =========================
   MONGODB SETUP
========================= */

const uri = process.env.MONGODB_URI;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();

    const conversationCollection = client
      .db("affiliate-ai")
      .collection("conversations");

    const analysisCollection = client.db("affiliate-ai").collection("analysis");

    const memoryCollection = client.db("affiliate-ai").collection("memory");

    const competitorCollection = client
      .db("affiliate-ai")
      .collection("competitors");

    const adLibraryCollection = client
      .db("affiliate-ai")
      .collection("ad-library");

    const vectorCollection = client.db("affiliate-ai").collection("vectors");

    const projectCollection = client.db("affiliate-ai").collection("projects");

    const savedCompetitorCollection = client
      .db("affiliate-ai")
      .collection("saved-competitors");

    const favoriteCollection = client
      .db("affiliate-ai")
      .collection("favorites");

    const workspaceCollection = client
      .db("affiliate-ai")
      .collection("workspaces");

    const campaignCollection = client
      .db("affiliate-ai")
      .collection("campaigns");

    const offerResearchCollection = client
      .db("affiliate-ai")
      .collection("offer-research");

    const offerCacheCollection = client
      .db("affiliate-ai")
      .collection("offer-cache");

    const landingPagesCollection = client
      .db("affiliate-ai")
      .collection("landing-pages");

    // Unique slug index
    await landingPagesCollection.createIndex({ slug: 1 }, { unique: true });

    // Useful for user's landing page dashboard later
    await landingPagesCollection.createIndex({
      createdAt: -1,
    });

    await landingPagesCollection.createIndex({
      updatedAt: -1,
    });

    // =========================================================
    // AFFILIATE TRACKING COLLECTIONS
    // =========================================================

    const trackingClicksCollection = client
      .db("affiliate-ai")
      .collection("tracking-clicks");

    const trackingConversionsCollection = client
      .db("affiliate-ai")
      .collection("tracking-conversions");

    // =========================================================
    // TRACKING INDEXES
    // =========================================================

    await trackingClicksCollection.createIndex(
      { clickId: 1 },
      { unique: true },
    );

    await trackingClicksCollection.createIndex({
      landingPageId: 1,
      createdAt: -1,
    });

    await trackingClicksCollection.createIndex({
      campaignId: 1,
      createdAt: -1,
    });

    await trackingClicksCollection.createIndex({
      createdAt: -1,
    });

    await trackingConversionsCollection.createIndex({
      clickId: 1,
    });

    // Prevent duplicate conversions for the same transaction
    await trackingConversionsCollection.createIndex(
      {
        clickId: 1,
        transactionId: 1,
      },
      {
        unique: true,
      },
    );

    await trackingConversionsCollection.createIndex({
      createdAt: -1,
    });

    const trackingCampaignsCollection = client
      .db("affiliate-ai")
      .collection("tracking-campaigns");

    // Campaign indexes
    await trackingCampaignsCollection.createIndex(
      { campaignId: 1 },
      { unique: true },
    );

    await trackingCampaignsCollection.createIndex({
      email: 1,
      createdAt: -1,
    });

    await trackingCampaignsCollection.createIndex({
      landingPageId: 1,
    });

    /* =========================================================
   Generate LANDING PAGE
   ========================================================= */

    app.post("/generate", async (req, res) => {
      try {
        const { prompt } = req.body;

        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: getPrompt(prompt),
        });

        const text =
          response.text ||
          response?.candidates?.[0]?.content?.parts?.[0]?.text ||
          "";

        const intent = extractIntent(text);
        const { score, analysis } = extractAnalysis(text);
        const html = extractCode(text);

        res.send({ html, intent, score, analysis });
      } catch (err) {
        res.status(500).send({ error: "AI failed" });
      }
    });

    /* =========================================================
   DEPLOY LANDING PAGE
   ========================================================= */

    app.post("/deploy", async (req, res) => {
      try {
        const {
          name,
          html,
          affiliateLink = "",
          slug: existingSlug = null,
          intent = "",
          email,
        } = req.body;

        // =====================================================
        // VALIDATION
        // =====================================================

        if (!html || typeof html !== "string") {
          return res.status(400).json({
            success: false,
            error: "Landing page HTML is required",
          });
        }

        if (Buffer.byteLength(html, "utf8") > MAX_LANDING_HTML_SIZE) {
          return res.status(413).json({
            success: false,
            error: "Landing page HTML is too large. Maximum size is 2 MB.",
          });
        }

        if (affiliateLink && !isValidHttpUrl(affiliateLink)) {
          return res.status(400).json({
            success: false,
            error: "Affiliate link must be a valid HTTP or HTTPS URL.",
          });
        }

        // =====================================================
        // PAGE NAME
        // =====================================================

        const pageName =
          typeof name === "string" && name.trim()
            ? name.trim().slice(0, 120)
            : "AI Landing Page";

        // =====================================================
        // INTENT
        // =====================================================

        const cleanIntent =
          typeof intent === "string" ? intent.trim().slice(0, 60) : "";

        // =====================================================
        // PREPARE HTML
        // =====================================================

        // const finalHTML = prepareLandingHTML(html, affiliateLink);

        let finalHTML = prepareLandingHTML(html, affiliateLink);

        finalHTML = makeImageUrlsAbsolute(finalHTML);

        const now = new Date();

        // =====================================================
        // BASE URL
        // =====================================================

        const baseURL =
          process.env.PUBLIC_BASE_URL ||
          `http://localhost:${process.env.PORT || 5000}`;

        const cleanBaseURL = baseURL.replace(/\/$/, "");

        // =====================================================
        // UPDATE EXISTING PAGE
        // =====================================================

        if (existingSlug) {
          const existingPage = await landingPagesCollection.findOne({
            slug: existingSlug,
            email: email,
          });

          if (!existingPage) {
            return res.status(404).json({
              success: false,
              error: "Landing page not found",
            });
          }

          await landingPagesCollection.updateOne(
            {
              slug: existingSlug,
              email: email,
            },
            {
              $set: {
                name: pageName,
                html: finalHTML,
                affiliateLink: affiliateLink || "",
                trackingParameter:
                  existingPage.trackingParameter ||
                  DEFAULT_AFFILIATE_TRACKING_PARAMETER,
                intent: cleanIntent,
                status: "published",
                updatedAt: now,
              },
            },
          );

          // Keep the existing slug and public URL unchanged
          const liveURL = `${cleanBaseURL}/${existingPage.slug}`;

          return res.json({
            success: true,
            action: "updated",
            slug: existingPage.slug,
            intent: cleanIntent,
            url: liveURL,
          });
        }

        // =====================================================
        // CREATE NEW PAGE
        // =====================================================

        let slug;
        let inserted = false;

        // =====================================================
        // GENERATE UNIQUE SLUG
        //
        // Example:
        // insurance-117bc58e2a
        // =====================================================

        for (let attempt = 0; attempt < 10; attempt++) {
          slug = createPublicLandingSlug(cleanIntent);

          try {
            await landingPagesCollection.insertOne({
              name: pageName,

              slug,

              html: finalHTML,

              affiliateLink: affiliateLink || "",

              // Affiliate tracking configuration
              trackingParameter: DEFAULT_AFFILIATE_TRACKING_PARAMETER,

              intent: cleanIntent,

              status: "published",

              campaignId: null,

              // Analytics
              views: 0,
              clicks: 0,

              createdAt: now,
              updatedAt: now,

              email,
            });

            inserted = true;

            break;
          } catch (error) {
            // Duplicate slug
            if (error?.code === 11000) {
              continue;
            }

            throw error;
          }
        }

        // =====================================================
        // FAILED TO CREATE UNIQUE SLUG
        // =====================================================

        if (!inserted) {
          return res.status(500).json({
            success: false,
            error: "Could not generate a unique landing page URL",
          });
        }

        // =====================================================
        // LIVE URL
        // =====================================================

        const liveURL = `${cleanBaseURL}/${slug}`;

        // =====================================================
        // SUCCESS RESPONSE
        // =====================================================

        return res.status(201).json({
          success: true,
          action: "created",
          slug,
          intent: cleanIntent,
          url: liveURL,
        });
      } catch (error) {
        console.error("Deploy landing page error:", error);

        return res.status(500).json({
          success: false,
          error: "Failed to deploy landing page",
        });
      }
    });

    /* =========================================================
   GET ALL DEPLOYED LANDING PAGES
   ========================================================= */

    app.get("/landing-pages", async (req, res) => {
      try {
        const pages = await landingPagesCollection
          .find({})
          .sort({ createdAt: -1 })
          .toArray();

        return res.status(200).json({
          success: true,
          count: pages.length,
          pages,
        });
      } catch (error) {
        console.error("Get all deployed landing pages error:", error);

        return res.status(500).json({
          success: false,
          error: "Failed to load deployed landing pages",
        });
      }
    });

    /* =========================================================
   PUBLIC LANDING PAGE
   ========================================================= */

    app.get("/:slug", async (req, res) => {
      try {
        const { slug } = req.params;

        // =====================================================
        // VALIDATE SLUG
        // =====================================================

        if (!slug || !/^[a-z0-9-]+$/i.test(slug)) {
          return res.status(400).send("Invalid landing page URL");
        }

        // =====================================================
        // FIND PAGE
        // =====================================================

        const page = await landingPagesCollection.findOne({
          slug,
          status: "published",
        });

        // =====================================================
        // PAGE NOT FOUND
        // =====================================================

        if (!page) {
          return res.status(404).send(`
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="UTF-8" />

            <meta
              name="viewport"
              content="width=device-width, initial-scale=1.0"
            />

            <title>Page Not Found</title>
          </head>

          <body
            style="
              margin:0;
              min-height:100vh;
              display:flex;
              align-items:center;
              justify-content:center;
              background:#020617;
              color:white;
              font-family:Arial,sans-serif;
            "
          >

            <div
              style="
                text-align:center;
                padding:24px;
              "
            >

              <h1>
                Landing Page Not Found
              </h1>

              <p
                style="
                  color:#94a3b8;
                "
              >
                The page you're looking for
                doesn't exist.
              </p>

            </div>

          </body>
        </html>
      `);
        }

        // =====================================================
        // INCREMENT PAGE VIEW
        // =====================================================

        await landingPagesCollection.updateOne(
          {
            _id: page._id,
          },
          {
            $inc: {
              views: 1,
            },
          },
        );

        // =====================================================
        // RESPONSE HEADERS
        // =====================================================

        res.setHeader("Content-Type", "text/html; charset=utf-8");

        res.setHeader("Cache-Control", "public, max-age=60");

        // =====================================================
        // SEND LANDING PAGE
        // =====================================================

        // const trackedHTML = injectTrackingScript(page.html, {
        //   campaignId: page.campaignId || null,

        //   landingPageId: page._id?.toString() || null,
        // });

        const trackedHTML = injectTrackingScript(page.html, {
          campaignId: page.campaignId || null,

          landingPageId: page._id?.toString() || null,

          affiliateLink: page.affiliateLink || "",
        });

        // return res.send(page.h
        return res.send(trackedHTML);
      } catch (error) {
        console.error("Landing page render error:", error);

        return res.status(500).send("Unable to load landing page");
      }
    });

    // =====================================================
    // DELETE LANDING PAGE
    // =====================================================
    app.delete("/landing-pages/:slug", async (req, res) => {
      try {
        const { slug } = req.params;
        const { email } = req.body;

        if (!slug || !email) {
          return res.status(400).json({
            success: false,
            error: "Landing page slug and email are required",
          });
        }

        const result = await landingPagesCollection.deleteOne({
          slug,
          email,
        });

        if (result.deletedCount === 0) {
          return res.status(404).json({
            success: false,
            error: "Landing page not found",
          });
        }

        return res.json({
          success: true,
          message: "Landing page deleted successfully",
          slug,
        });
      } catch (error) {
        console.error("Delete landing page error:", error);

        return res.status(500).json({
          success: false,
          error: "Failed to delete landing page",
        });
      }
    });

    app.post("/generate-ads", async (req, res) => {
      try {
        const { prompt, mode, conversationId, url, projectId, country } =
          req.body;

        let ragContext = "";

        if (prompt) {
          const queryEmbedding = await createEmbedding(ai, prompt);
          const similarDocs = await vectorSearch(
            vectorCollection,
            queryEmbedding,
          );
          ragContext = buildRagContext(similarDocs);
        }

        let currentConversationId = conversationId;

        if (!currentConversationId) {
          const newConversation = await conversationCollection.insertOne({
            title: (prompt || url || "New Chat").substring(0, 50),
            createdAt: new Date(),
            updatedAt: new Date(),
            messages: [],
          });

          currentConversationId = newConversation.insertedId.toString();
        }

        await conversationCollection.updateOne(
          { _id: new ObjectId(currentConversationId) },
          {
            $push: {
              messages: {
                role: "user",
                content: prompt || url,
              },
            },
            $set: { updatedAt: new Date() },
          },
        );

        const conversation = await conversationCollection.findOne({
          _id: new ObjectId(currentConversationId),
        });

        const conversationHistory = conversation?.messages || [];

        const historyText = conversationHistory
          .slice(-20)
          .map((msg) => {
            const content =
              typeof msg.content === "string"
                ? msg.content
                : JSON.stringify(msg.content);

            return `${msg.role.toUpperCase()}:\n${content}`;
          })
          .join("\n\n");

        let lastAssistantMessage = "";

        const assistantMessages = conversationHistory.filter(
          (m) => m.role === "assistant",
        );

        if (assistantMessages.length) {
          lastAssistantMessage = stringifyContent(
            assistantMessages[assistantMessages.length - 1].content,
          );
        }

        // const intent = detectIntent({ url, prompt, mode });

        const responseMode = detectResponseMode({
          prompt,
          url,
        });

        let scrapedData = null;
        let aiPrompt = null;

        // const schemaType = getSchemaType(intent, scrapedData);

        if (url) {
          scrapedData = await getScrapedData(url);
        }

        if (url && !prompt) {
          if (responseMode === "analysis") {
            aiPrompt = buildPrompt({
              urlData: scrapedData,
            });
          }
        }

        if (prompt && !url) {
          if (responseMode === "chat") {
            aiPrompt = chatPrompt({
              ragContext,
              prompt,
              historyText,
              previousOutput: isFollowUpPrompt(prompt)
                ? lastAssistantMessage
                : "",
            });
          }
        }

        if (prompt && url) {
          if (responseMode === "chat") {
            aiPrompt = chatPrompt({
              ragContext,
              prompt,
              historyText,
              urlData: scrapedData,
              previousOutput: isFollowUpPrompt(prompt)
                ? lastAssistantMessage
                : "",
            });
          }
        }

        let response;

        try {
          response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: aiPrompt,
            generationConfig: {
              responseMimeType:
                responseMode === "analysis" ? "application/json" : "text/plain",
            },
          });
        } catch (err) {
          console.log("Gemini 2.5 Flash Busy");
          response = await ai.models.generateContent({
            model: "gemini-2.0-flash",
            contents: aiPrompt,
            generationConfig: {
              responseMimeType:
                responseMode === "analysis" ? "application/json" : "text/plain",
            },
          });
        }

        const raw =
          response.text ||
          response?.candidates?.[0]?.content?.parts?.[0]?.text ||
          "";

        const data = safeJSON(raw);

        let finalData = null;

        if (responseMode === "chat") {
          finalData = {
            reply: raw.trim(),
          };
        } else {
          const json = safeJSON(raw);
          if (json) {
            finalData = json;
          } else {
            finalData = {
              reply: raw.trim(),
            };
          }
        }

        const learningData = await learningEngine(analysisCollection);

        // if (pageScore?.overallScore > 85) {
        //   await adLibraryCollection.insertOne({
        //     niche: finalData?.whatTheySell || "",

        //     ad: finalData,

        //     score: pageScore,

        //     createdAt: new Date(),
        //   });
        // }

        // await analysisCollection.insertOne({
        //   projectId,

        //   url,

        //   schemaType,

        //   pageAnalysis,

        //   pageScore,

        //   competitorScore,

        //   recommendations,

        //   agentData,

        //   learningData,

        //   aiOutput: finalData,

        //   createdAt: new Date(),
        // });

        const embedding = await createEmbedding(ai, JSON.stringify(finalData));

        await vectorCollection.insertOne({
          embedding,
          // schemaType,
          url,
          data: finalData,
          createdAt: new Date(),
        });

        // await memoryCollection.insertOne({
        //   business: finalData?.whatTheySell || "",

        //   audience: finalData?.targetAudience || "",

        //   angle: finalData?.marketingAngle || "",

        //   createdAt: new Date(),
        // });

        await conversationCollection.updateOne(
          { _id: new ObjectId(currentConversationId) },
          {
            $push: {
              messages: {
                role: "assistant",
                content:
                  responseMode === "chat"
                    ? raw.trim()
                    : responseMode === "analysis"
                      ? raw.trim()
                      : finalData,
                createdAt: new Date(),
              },
            },
          },
        );

        // await competitorCollection.updateOne(
        //   { url },

        //   {
        //     $set: {
        //       whatTheySell: finalData?.whatTheySell,

        //       targetAudience: finalData?.targetAudience,

        //       score: competitorScore,

        //       updatedAt: new Date(),
        //     },
        //   },

        //   { upsert: true },
        // );

        return res.json({
          success: true,

          conversationId: currentConversationId,

          // type: schemaType,
          type: responseMode,

          // schemaType: schemaType,

          // analysis: pageAnalysis,

          // score: pageScore,

          // competitorScore,

          // recommendations,

          learningData,

          // similarCompetitors,

          ragContext,

          // agentData,

          data: finalData,
        });

        // =========================
        // CHAT MODE RESPONSE
        // =========================
        // if (isChatMode) {
        //   await conversationCollection.updateOne(
        //     { _id: new ObjectId(currentConversationId) },
        //     {
        //       $push: {
        //         messages: {
        //           role: "ai",
        //           type: "chat",
        //           content: raw.trim(),
        //         },
        //       },
        //     },
        //   );

        //   return res.json({
        //     success: true,
        //     type: "chat",
        //     conversationId: currentConversationId,
        //     data: {
        //       reply: raw.trim(),
        //     },
        //   });
        // }
        // =========================
        // CREATE AD MODE (AUTO)
        // =========================
        // =========================
        // if (isCreateAdMode) {
        //   if (!data) {
        //     return res.json({
        //       success: false,
        //       type: "error",
        //       message: "Invalid ad JSON",
        //       conversationId: currentConversationId,
        //     });
        //   }

        //   await conversationCollection.updateOne(
        //     { _id: new ObjectId(currentConversationId) },
        //     {
        //       $push: {
        //         messages: {
        //           role: "ai",
        //           type: "create_ad",
        //           content: data,
        //         },
        //       },
        //     },
        //   );

        //   return res.json({
        //     success: true,
        //     type: "create_ad",
        //     conversationId: currentConversationId,
        //     data,
        //   });
        // }
        // =========================
        // ANALYSIS MODE
        // =========================
        // const data = safeJSON(raw);

        // if (!data) {
        //   console.log("INVALID JSON:", raw);

        //   return res.json({
        //     success: false,
        //     type: "error",
        //     conversationId: currentConversationId,
        //     message: "AI returned invalid JSON",
        //   });
        // }

        // await conversationCollection.updateOne(
        //   { _id: new ObjectId(currentConversationId) },
        //   {
        //     $push: {
        //       messages: {
        //         role: "ai",
        //         type: "analysis",
        //         content: data,
        //       },
        //     },
        //   },
        // );

        // return res.json({
        //   success: true,
        //   type: "analysis",
        //   conversationId: currentConversationId,
        //   data,
        // });
      } catch (err) {
        console.log("🔥 FACEBOOK ADS ERROR:", err);

        console.log("STATUS =", err.status);
        console.log("MESSAGE =", err.message);

        return res.json({
          success: false,
          type: "error",
          message: err.message,
        });
      }
    });

    app.post("/generate-variations", async (req, res) => {
      try {
        const { ad, activeAdType } = req.body;

        const finalPrompt = getVariationPrompt(ad, activeAdType);

        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: finalPrompt,
        });

        const raw =
          response.text ||
          response?.candidates?.[0]?.content?.parts?.[0]?.text ||
          "";

        const cleaned = raw
          .replace(/```json/g, "")
          .replace(/```/g, "")
          .trim();

        const parsed = JSON.parse(cleaned);

        const variations = Array.isArray(parsed)
          ? parsed
          : parsed.variations || [];

        res.send({ variations });
        console.log(variations);
      } catch (err) {
        console.log(err);
        res.status(500).send({
          error: "Variation generation failed",
        });
      }
    });

    app.post("/generate-socialmedia-ads", async (req, res) => {
      try {
        const { ad, addType } = req.body;

        console.log("Generating Social Media Ads for:", ad);

        const finalPrompt = socialMediaPrompt(ad.reply, addType);

        console.log("Social Media Ads Prompt:", finalPrompt);

        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: finalPrompt,
        });

        const raw =
          response.text ||
          response?.candidates?.[0]?.content?.parts?.[0]?.text ||
          "";

        console.log("Social Media Ads Raw Response:", raw);

        const cleaned = raw
          .replace(/```json/g, "")
          .replace(/```/g, "")
          .trim();

        const data = safeJSON(cleaned);

        const formattedData = Array.isArray(data) ? data : [data];

        res.send({
          data: formattedData[0],
        });
      } catch (err) {
        console.log(err);
        res.status(500).send({
          error: "Social Media Ads generation failed",
        });
      }
    });

    /* =========================================================
   CREATE TRACKING CLICK
   ========================================================= */

    app.get("/api/tracking/click", async (req, res) => {
      try {
        const {
          campaignId = null,
          landingPageId = null,
          utm_source = null,
          utm_medium = null,
          utm_campaign = null,
          utm_content = null,
          utm_term = null,
          fbclid = null,
          gclid = null,
          ttclid = null,
          ref = null,
        } = req.query;

        const userAgent = req.headers["user-agent"] || "";

        const ip = getClientIp(req);

        const clickId = generateTrackingClickId();

        // Find campaign owner
        let ownerEmail = null;

        if (campaignId) {
          const campaign = await trackingCampaignsCollection.findOne(
            { campaignId },
            { projection: { email: 1, landingPageId: 1 } },
          );

          if (!campaign) {
            return res.status(404).json({
              success: false,
              error: "Tracking campaign not found",
            });
          }

          // Validate that this landing page belongs to this campaign
          if (String(campaign.landingPageId) !== String(landingPageId)) {
            return res.status(400).json({
              success: false,
              error: "This landing page does not belong to this campaign",
            });
          }

          ownerEmail = campaign.email;
        }

        const referrer = req.headers["referer"] || ref || null;

        const clickData = {
          clickId,

          campaignId,

          ownerEmail,

          landingPageId,

          // Traffic source
          utm: {
            source: utm_source,
            medium: utm_medium,
            campaign: utm_campaign,
            content: utm_content,
            term: utm_term,
          },

          // Ad platform IDs
          fbclid,
          gclid,
          ttclid,

          // Visitor
          ip,
          userAgent,
          referrer,
          device: detectDevice(userAgent),
          browser: detectBrowser(userAgent),
          os: detectOS(userAgent),

          // Conversion
          converted: false,
          conversionId: null,

          createdAt: new Date(),
        };

        await trackingClicksCollection.insertOne(clickData);

        if (campaignId && ownerEmail) {
          await trackingCampaignsCollection.updateOne(
            {
              campaignId,
              email: ownerEmail,
            },
            {
              $inc: {
                clicks: 1,
              },
              $set: {
                updatedAt: new Date(),
              },
            },
          );
        }

        return res.status(200).json({
          success: true,

          clickId,

          campaignId,

          landingPageId,

          createdAt: clickData.createdAt,
        });
      } catch (error) {
        console.error("❌ TRACKING CLICK ERROR:", error);

        return res.status(500).json({
          success: false,
          error: "Failed to create tracking click",
        });
      }
    });

    // app.get("/api/tracking/click", async (req, res) => {
    //   try {
    //     const {
    //       campaignId = null,
    //       landingPageId = null,

    //       utm_source = null,
    //       utm_medium = null,
    //       utm_campaign = null,
    //       utm_content = null,
    //       utm_term = null,

    //       fbclid = null,
    //       gclid = null,
    //       ttclid = null,

    //       ref = null,
    //     } = req.query;

    //     const userAgent = req.headers["user-agent"] || "";

    //     const ip = getClientIp(req);

    //     const clickId = generateTrackingClickId();

    //     // Find campaign owner
    //     let ownerEmail = null;

    //     if (campaignId) {
    //       const campaign = await trackingCampaignsCollection.findOne(
    //         { campaignId },
    //         { projection: { email: 1 } },
    //       );

    //       if (!campaign) {
    //         return res.status(404).json({
    //           success: false,
    //           error: "Tracking campaign not found",
    //         });
    //       }

    //       ownerEmail = campaign.email;
    //     }

    //     const referrer = req.headers["referer"] || ref || null;

    //     const clickData = {
    //       clickId,

    //       campaignId,

    //       ownerEmail,

    //       landingPageId,

    //       // Traffic source
    //       utm: {
    //         source: utm_source,
    //         medium: utm_medium,
    //         campaign: utm_campaign,
    //         content: utm_content,
    //         term: utm_term,
    //       },

    //       // Ad platform IDs
    //       fbclid,
    //       gclid,
    //       ttclid,

    //       // Visitor
    //       ip,
    //       userAgent,
    //       referrer,
    //       device: detectDevice(userAgent),
    //       browser: detectBrowser(userAgent),
    //       os: detectOS(userAgent),

    //       // Conversion
    //       converted: false,
    //       conversionId: null,

    //       createdAt: new Date(),
    //     };

    //     await trackingClicksCollection.insertOne(clickData);

    //     if (campaignId && ownerEmail) {
    //       await trackingCampaignsCollection.updateOne(
    //         {
    //           campaignId,
    //           email: ownerEmail,
    //         },
    //         {
    //           $inc: {
    //             clicks: 1,
    //           },
    //           $set: {
    //             updatedAt: new Date(),
    //           },
    //         },
    //       );
    //     }

    //     return res.status(200).json({
    //       success: true,

    //       clickId,

    //       campaignId,

    //       landingPageId,

    //       createdAt: clickData.createdAt,
    //     });
    //   } catch (error) {
    //     console.error("❌ TRACKING CLICK ERROR:", error);

    //     return res.status(500).json({
    //       success: false,
    //       error: "Failed to create tracking click",
    //     });
    //   }
    // });

    // =========================================================
    // AFFILIATE TRACKING REDIRECT
    // =========================================================

    // Flow:

    // Visitor CTA
    //     ↓
    // /api/tracking/redirect?clickId=cl_xxx
    //     ↓
    // Validate clickId
    //     ↓
    // Find tracking click
    //     ↓
    // Find landing page
    //     ↓
    // Build affiliate URL
    //     ↓
    // 302 Redirect

    // =========================================================

    app.get("/api/tracking/redirect", async (req, res) => {
      try {
        const clickId =
          typeof req.query.clickId === "string" ? req.query.clickId.trim() : "";

        // =====================================================
        // VALIDATE CLICK ID
        // =====================================================

        if (!clickId || !/^cl_[a-f0-9]{32}$/i.test(clickId)) {
          return res.status(400).send("Invalid tracking click ID");
        }

        // =====================================================
        // FIND CLICK
        // =====================================================

        const click = await trackingClicksCollection.findOne(
          {
            clickId,
          },
          {
            projection: {
              _id: 1,
              clickId: 1,
              campaignId: 1,
              landingPageId: 1,
              createdAt: 1,
            },
          },
        );

        if (!click) {
          return res.status(404).send("Tracking click not found");
        }

        // =====================================================
        // VALIDATE LANDING PAGE ID
        // =====================================================

        if (
          !click.landingPageId ||
          !ObjectId.isValid(String(click.landingPageId))
        ) {
          console.error("❌ REDIRECT INVALID LANDING PAGE ID:", {
            clickId,
            landingPageId: click.landingPageId,
          });

          return res.status(404).send("Landing page not found");
        }

        // =====================================================
        // FIND LANDING PAGE
        // =====================================================

        const landingPage = await landingPagesCollection.findOne(
          {
            _id: new ObjectId(String(click.landingPageId)),
            status: "published",
          },
          {
            projection: {
              _id: 1,
              affiliateLink: 1,
              trackingParameter: 1,
            },
          },
        );

        if (!landingPage) {
          return res.status(404).send("Landing page not found");
        }

        // =====================================================
        // VALIDATE AFFILIATE LINK
        // =====================================================

        const affiliateLink =
          typeof landingPage.affiliateLink === "string"
            ? landingPage.affiliateLink.trim()
            : "";

        if (!affiliateLink || !isValidHttpUrl(affiliateLink)) {
          console.error("❌ INVALID AFFILIATE LINK:", {
            clickId,
            landingPageId: click.landingPageId,
          });

          return res.status(404).send("Affiliate offer is not configured");
        }

        // =====================================================
        // BUILD TRACKED AFFILIATE URL
        // =====================================================

        const trackedAffiliateUrl = buildAffiliateTrackingUrl({
          affiliateLink,
          clickId,
          trackingParameter:
            landingPage.trackingParameter ||
            DEFAULT_AFFILIATE_TRACKING_PARAMETER,
        });

        if (!trackedAffiliateUrl) {
          return res.status(500).send("Unable to build affiliate tracking URL");
        }

        // Record the successful outbound affiliate redirect
        await Promise.all([
          trackingClicksCollection.updateOne(
            { clickId },
            {
              $set: {
                affiliateRedirectedAt: new Date(),
              },
            },
          ),

          landingPagesCollection.updateOne(
            { _id: landingPage._id },
            {
              $inc: {
                clicks: 1,
              },
            },
          ),
        ]);

        // =====================================================
        // REDIRECT
        // =====================================================

        return res.redirect(302, trackedAffiliateUrl);
      } catch (error) {
        console.error("❌ AFFILIATE REDIRECT ERROR:", error);

        return res.status(500).send("Unable to process affiliate redirect");
      }
    });

    /* =========================================================
   AFFILIATE CONVERSION POSTBACK (S2S)
========================================================= */

    app.get("/api/tracking/postback", async (req, res) => {
      try {
        const {
          clickId,
          payout = "0",
          txid,
          status = "approved",
          key,
        } = req.query;

        // 1. Validate postback secret

        const secret = process.env.TRACKING_POSTBACK_SECRET;

        if (
          !secret ||
          typeof key !== "string" ||
          key.length !== secret.length ||
          !crypto.timingSafeEqual(Buffer.from(key), Buffer.from(secret))
        ) {
          return res.status(401).json({
            success: false,
            error: "Invalid postback authentication",
          });
        }

        // 2. Validate Click ID

        if (
          typeof clickId !== "string" ||
          !/^cl_[a-f0-9]{32}$/i.test(clickId)
        ) {
          return res.status(400).json({
            success: false,
            error: "Invalid click ID",
          });
        }

        // 3. Validate payout

        const revenue = Number(payout);

        if (!Number.isFinite(revenue) || revenue < 0) {
          return res.status(400).json({
            success: false,
            error: "Invalid payout amount",
          });
        }

        // 4. Validate transaction ID

        const transactionId =
          typeof txid === "string" && txid.trim() ? txid.trim() : clickId;

        if (transactionId.length > 200) {
          return res.status(400).json({
            success: false,
            error: "Invalid transaction ID",
          });
        }

        // 5. Normalize conversion status

        const rawStatus = String(status).toLowerCase().trim();

        const statusMap = {
          approved: "approved",
          confirmed: "approved",
          pending: "pending",
          declined: "declined",
          rejected: "declined",
          cancelled: "declined",
        };

        const conversionStatus = statusMap[rawStatus];

        if (!conversionStatus) {
          return res.status(400).json({
            success: false,
            error: "Unsupported conversion status",
          });
        }

        // 6. Find original tracking click

        const click = await trackingClicksCollection.findOne({
          clickId,
        });

        if (!click) {
          return res.status(404).json({
            success: false,
            error: "Tracking click not found",
          });
        }

        const now = new Date();

        // 7. Find existing conversion

        const conversionFilter = {
          clickId,
          transactionId,
        };

        const existingConversion =
          await trackingConversionsCollection.findOne(conversionFilter);

        const oldRevenue =
          existingConversion?.status === "approved"
            ? Number(existingConversion.payout || 0)
            : 0;

        const newRevenue = conversionStatus === "approved" ? revenue : 0;

        const revenueDifference = newRevenue - oldRevenue;

        const conversionId =
          existingConversion?.conversionId ||
          `cv_${crypto.randomBytes(16).toString("hex")}`;

        // 8. Save or update conversion

        const conversionData = {
          conversionId,
          clickId,
          transactionId,
          campaignId: click.campaignId || null,
          landingPageId: click.landingPageId || null,
          ownerEmail: click.ownerEmail || null,
          payout: revenue,
          status: conversionStatus,
          trafficSource: click.utm?.source || null,
          updatedAt: now,
        };

        if (existingConversion) {
          await trackingConversionsCollection.updateOne(conversionFilter, {
            $set: conversionData,
          });
        } else {
          try {
            await trackingConversionsCollection.insertOne({
              ...conversionData,
              createdAt: now,
            });
          } catch (error) {
            if (error.code === 11000) {
              return res.status(200).json({
                success: true,
                duplicate: true,
                message: "Conversion already received",
              });
            }

            throw error;
          }
        }

        // 9. Update original click

        await trackingClicksCollection.updateOne(
          { clickId },
          {
            $set: {
              converted: conversionStatus === "approved",
              conversionId,
              conversionStatus,
              convertedAt: now,
            },
          },
        );

        // 10. Update campaign statistics

        if (click.campaignId) {
          const campaignUpdate = {
            $set: {
              updatedAt: now,
            },
          };

          if (!existingConversion) {
            campaignUpdate.$inc = {
              conversions: 1,
            };
          }

          if (revenueDifference !== 0) {
            campaignUpdate.$inc = {
              ...(campaignUpdate.$inc || {}),
              revenue: revenueDifference,
            };
          }

          await trackingCampaignsCollection.updateOne(
            {
              campaignId: click.campaignId,
              ...(click.ownerEmail ? { email: click.ownerEmail } : {}),
            },
            campaignUpdate,
          );
        }

        // 11. Success response

        return res.status(200).json({
          success: true,
          message: "Conversion tracked successfully",
          conversion: {
            conversionId,
            clickId,
            transactionId,
            payout: revenue,
            status: conversionStatus,
          },
        });
      } catch (error) {
        console.error("CONVERSION POSTBACK ERROR:", error);

        return res.status(500).json({
          success: false,
          error: "Failed to process conversion",
        });
      }
    });

    // =========================================================
    // CREATE TRACKING CAMPAIGN
    // =========================================================

    app.post("/api/tracking/campaigns", async (req, res) => {
      try {
        const {
          name,
          email,
          landingPageId,
          trafficSource,
          costModel = "CPC",
        } = req.body;

        // Validate required fields
        if (!name || !email || !landingPageId || !trafficSource) {
          return res.status(400).json({
            success: false,
            error: "Name, email, landingPageId and trafficSource are required",
          });
        }

        // Validate landing page ID
        if (!ObjectId.isValid(String(landingPageId))) {
          return res.status(400).json({
            success: false,
            error: "Invalid landing page ID",
          });
        }

        // Find user's published landing page
        const landingPage = await landingPagesCollection.findOne({
          _id: new ObjectId(String(landingPageId)),
          email: email.trim().toLowerCase(),
          status: "published",
        });

        if (!landingPage) {
          return res.status(404).json({
            success: false,
            error: "Published landing page not found",
          });
        }

        // Generate unique campaign ID
        const campaignId = "cmp_" + crypto.randomBytes(16).toString("hex");

        const now = new Date();

        const campaignData = {
          campaignId,

          name: name.trim(),

          email: email.trim().toLowerCase(),

          landingPageId: landingPage._id.toString(),

          trafficSource: trafficSource.trim(),

          costModel,

          status: "active",

          clicks: 0,

          conversions: 0,

          cost: 0,

          revenue: 0,

          createdAt: now,

          updatedAt: now,
        };

        await trackingCampaignsCollection.insertOne(campaignData);

        return res.status(201).json({
          success: true,
          message: "Tracking campaign created successfully",
          campaign: campaignData,
        });
      } catch (error) {
        console.error("CREATE TRACKING CAMPAIGN ERROR:", error);

        return res.status(500).json({
          success: false,
          error: "Failed to create tracking campaign",
        });
      }
    });

    app.post("/api/tracking/campaigns/:campaignId/url", async (req, res) => {
      try {
        const { campaignId } = req.params;
        const {
          email,
          utm_source,
          utm_medium,
          utm_campaign,
          utm_content,
          utm_term,
        } = req.body;

        if (!email || !campaignId) {
          return res.status(400).json({
            success: false,
            error: "Email and campaign ID are required",
          });
        }

        // Find campaign owned by this user
        const campaign = await trackingCampaignsCollection.findOne({
          campaignId,
          email: email.trim().toLowerCase(),
        });

        if (!campaign) {
          return res.status(404).json({
            success: false,
            error: "Tracking campaign not found",
          });
        }

        // Find associated landing page
        const landingPage = await landingPagesCollection.findOne({
          _id: new ObjectId(campaign.landingPageId),
          email: email.trim().toLowerCase(),
          status: "published",
        });

        if (!landingPage) {
          return res.status(404).json({
            success: false,
            error: "Published landing page not found",
          });
        }

        const baseUrl = (
          process.env.PUBLIC_BASE_URL || `http://localhost:${PORT || 5000}`
        ).replace(/\/$/, "");

        const trackingUrl = new URL(`${baseUrl}/${landingPage.slug}`);

        // Campaign ID
        trackingUrl.searchParams.set("campaignId", campaignId);

        // UTM parameters
        if (utm_source) trackingUrl.searchParams.set("utm_source", utm_source);
        if (utm_medium) trackingUrl.searchParams.set("utm_medium", utm_medium);
        if (utm_campaign)
          trackingUrl.searchParams.set("utm_campaign", utm_campaign);
        if (utm_content)
          trackingUrl.searchParams.set("utm_content", utm_content);
        if (utm_term) trackingUrl.searchParams.set("utm_term", utm_term);

        return res.status(200).json({
          success: true,
          message: "Tracking URL generated successfully",
          trackingUrl: trackingUrl.toString(),
          campaignId,
          landingPage: {
            id: landingPage._id.toString(),
            name: landingPage.name,
            slug: landingPage.slug,
          },
        });
      } catch (error) {
        console.error("GENERATE TRACKING URL ERROR:", error);

        return res.status(500).json({
          success: false,
          error: "Failed to generate tracking URL",
        });
      }
    });

    // no need this api

    // app.post("/trending-offers", async (req, res) => {
    //   try {
    //     const { country } = req.body;
    //     if (!country) {
    //       return res.status(400).json({
    //         success: false,
    //         message: "Country name is required.",
    //       });
    //     }

    //     // const trendingData = await scrapeAmazonProducts(country);

    //     // const amazonTrendingData = JSON.stringify(trendingData, null, 2);

    //     // console.log("Amazon Trending Data:", amazonTrendingData);

    //     // const tiktokData = await scrapeTikTokProducts();

    //     // const tiktokData = await createTikTokSession()

    //     // console.log(tiktokData);

    //     const session = await createTikTokSession({ countryCode: "US" });

    //     console.log("TikTok session created");

    //     console.log(session);

    //     const result = await fetchAllTikTokTopAds({
    //       countryCode: "US",
    //       period: 30,
    //       limit: 20,
    //       apiHeaders: session.apiHeaders,
    //       cookieHeader: session.cookieHeader,
    //     });

    //     console.dir(result, { depth: null });

    //     const decisionData = createTikTokDecisionData(result.ads);

    //     // console.log("TikTok Decision Data:");

    //     // console.dir(decisionData, {
    //     //   depth: null,
    //     // });

    //     // console.log("TikTok Decision Data created");

    //     // console.log({
    //     //   totalAds: decisionData?.summary?.totalAds,

    //     //   topAds: decisionData?.topAds?.length,

    //     //   allAds: decisionData?.ads?.length,
    //     // });

    //     // ==========================================
    //     // 4. AI Analysis
    //     // ==========================================

    //     const aiIntelligence = await analyzeTikTokAdsWithAI(decisionData);

    //     console.log("TikTok AI Intelligence created");

    //     console.dir(aiIntelligence, {
    //       depth: null,
    //     });

    //     return res.status(200).json({
    //       success: true,

    //       country,

    //       // data: trendingData,
    //       // data: decisionData,

    //       data: {
    //         summary: decisionData.summary,

    //         statistics: decisionData.statistics,

    //         insights: decisionData.insights,

    //         topAds: decisionData.topAds,

    //         aiIntelligence,

    //         ads: decisionData.ads,
    //       },
    //     });
    //   } catch (error) {
    //     console.error(
    //       "🔥 TRENDING OFFER ERROR:",

    //       error,
    //     );

    //     return res.status(500).json({
    //       success: false,

    //       message: "Failed to collect trending offers.",

    //       error: error.message,
    //     });
    //   }
    // });

    // app.post("/projects", async (req, res) => {
    //   try {
    //     const { name } = req.body;

    //     const result = await projectCollection.insertOne({
    //       name,

    //       createdAt: new Date(),
    //     });

    //     res.json({
    //       success: true,
    //       projectId: result.insertedId,
    //     });
    //   } catch (err) {
    //     res.json({
    //       success: false,
    //     });
    //   }
    // });

    // app.get("/projects", async (req, res) => {
    //   const projects = await projectCollection
    //     .find()
    //     .sort({
    //       createdAt: -1,
    //     })
    //     .toArray();

    //   res.json(projects);
    // });

    // app.get("/project/:id", async (req, res) => {
    //   const analyses = await analysisCollection

    //     .find({
    //       projectId: req.params.id,
    //     })

    //     .sort({
    //       createdAt: -1,
    //     })

    //     .toArray();

    //   res.json({
    //     success: true,
    //     analyses,
    //   });
    // });

    // app.post("/save-competitor", async (req, res) => {
    //   const { competitorId } = req.body;

    //   const competitor = await competitorCollection.findOne({
    //     _id: new ObjectId(competitorId),
    //   });

    //   await savedCompetitorCollection.insertOne({
    //     ...competitor,

    //     savedAt: new Date(),
    //   });

    //   res.json({
    //     success: true,
    //   });
    // });

    // app.post("/favorite-analysis", async (req, res) => {
    //   const { analysisId } = req.body;

    //   await favoriteCollection.insertOne({
    //     analysisId,

    //     createdAt: new Date(),
    //   });

    //   res.json({
    //     success: true,
    //   });
    // });

    // app.post("/workspace", async (req, res) => {
    //   const { projectId, title } = req.body;

    //   const result = await workspaceCollection.insertOne({
    //     projectId,

    //     title,

    //     hooks: [],

    //     offers: [],

    //     ads: [],

    //     landingPages: [],

    //     campaigns: [],

    //     createdAt: new Date(),
    //   });

    //   res.json({
    //     success: true,
    //     id: result.insertedId,
    //   });
    // });

    // app.post("/workspace/hook", async (req, res) => {
    //   const { workspaceId, hook } = req.body;

    //   await workspaceCollection.updateOne(
    //     {
    //       _id: new ObjectId(workspaceId),
    //     },

    //     {
    //       $push: {
    //         hooks: hook,
    //       },
    //     },
    //   );

    //   res.json({
    //     success: true,
    //   });
    // });

    // app.post("/workspace/ad", async (req, res) => {
    //   const { workspaceId, ad } = req.body;

    //   await workspaceCollection.updateOne(
    //     {
    //       _id: new ObjectId(workspaceId),
    //     },

    //     {
    //       $push: {
    //         ads: ad,
    //       },
    //     },
    //   );

    //   res.json({
    //     success: true,
    //   });
    // });

    // app.get("/dashboard", async (req, res) => {
    //   const totalProjects = await projectCollection.countDocuments();

    //   const totalAnalysis = await analysisCollection.countDocuments();

    //   const totalCompetitors = await competitorCollection.countDocuments();

    //   res.json({
    //     totalProjects,

    //     totalAnalysis,

    //     totalCompetitors,
    //   });
    // });

    // app.post("/campaign-builder", async (req, res) => {
    //   try {
    //     const { product } = req.body;

    //     const result = await campaignBuilder(ai, product);

    //     res.json({
    //       success: true,

    //       data: result,
    //     });
    //   } catch (err) {
    //     res.json({
    //       success: false,
    //     });
    //   }
    // });

    // app.post("/campaign", async (req, res) => {
    //   try {
    //     const { product, projectId } = req.body;

    //     const campaign = await campaignRunner(ai, product);

    //     await campaignCollection.insertOne({
    //       product,

    //       projectId,

    //       campaign,

    //       createdAt: new Date(),
    //     });

    //     await workspaceCollection.updateOne(
    //       {
    //         projectId,
    //       },

    //       {
    //         $push: {
    //           campaigns: campaign,
    //         },
    //       },
    //     );

    //     res.json({
    //       success: true,

    //       campaign,
    //     });
    //   } catch (err) {
    //     res.json({
    //       success: false,
    //     });
    //   }
    // });

    app.get("/history", async (req, res) => {
      const history = await conversationCollection
        .find({})
        .sort({ updatedAt: -1 })
        .toArray();

      res.send(history);
    });

    app.get("/history/:id", async (req, res) => {
      const data = await conversationCollection.findOne({
        _id: new ObjectId(req.params.id),
      });

      res.send(data);
    });

    app.put("/chat/rename/:id", async (req, res) => {
      try {
        const { id } = req.params;
        const { title } = req.body;

        if (!title) {
          return res.status(400).json({ error: "Title required" });
        }

        const result = await conversationCollection.updateOne(
          { _id: new ObjectId(id) },
          {
            $set: {
              title,
              updatedAt: new Date(),
            },
          },
        );

        res.json({
          success: true,
          message: "Chat renamed successfully",
          result,
        });
      } catch (err) {
        console.log(err);
        res.status(500).json({ error: "Rename failed" });
      }
    });

    app.delete("/chat/delete/:id", async (req, res) => {
      try {
        const { id } = req.params;

        const result = await conversationCollection.deleteOne({
          _id: new ObjectId(id),
        });

        res.json({
          success: true,
          message: "Chat deleted successfully",
          result,
        });
      } catch (err) {
        console.log(err);
        res.status(500).json({ error: "Delete failed" });
      }
    });

    await client.db("admin").command({ ping: 1 });

    // startTrendingCollector(trendingOffersCollection);

    console.log("🚀 Server + DB connected successfully");
  } finally {
    // keep alive
  }
}

run().catch(console.dir);

/* =========================
   SERVER START
========================= */
const port = process.env.PORT || 5000;

app.get("/", (req, res) => {
  res.send("Server Running");
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);

  // startTrendingCollector();
});
