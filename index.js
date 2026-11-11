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

// function prepareLandingHTML(html, affiliateLink) {
//   if (!html || typeof html !== "string") {
//     throw new Error("Invalid landing page HTML");
//   }

//   if (Buffer.byteLength(html, "utf8") > MAX_LANDING_HTML_SIZE) {
//     throw new Error("Landing page HTML is too large");
//   }

//   let finalHTML = html;

//   // Replace affiliate link placeholder
//   if (affiliateLink) {
//     finalHTML = finalHTML.replaceAll(
//       "{{AFFILIATE_LINK}}",
//       escapeHtmlAttribute(affiliateLink),
//     );
//   }

//   // Prevent accidental unresolved placeholder
//   finalHTML = finalHTML.replaceAll("{{AFFILIATE_LINK}}", "#");

//   return finalHTML;
// }

function prepareLandingHTML(html, affiliateLink, offerId = null) {
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

  // Prevent unresolved affiliate link placeholder
  finalHTML = finalHTML.replaceAll("{{AFFILIATE_LINK}}", "#");

  // Attach Offer ID to every tracked CTA
  if (offerId && /^[a-f0-9]{24}$/i.test(offerId)) {
    finalHTML = finalHTML.replace(
      /<a\b([^>]*\bdata-track\s*=\s*(?:"[^"]*"|'[^']*')[^>]*)>/gi,
      (match, attributes) => {
        return `<a${attributes} data-offer-id="${offerId}">`;
      },
    );
  }

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

            // Send the Offer ID associated with this CTA
             const offerId = link.getAttribute("data-offer-id");

            if (offerId) {
               redirectUrl.searchParams.set("offerId", offerId);
            }

            // Get CTA button information
const ctaLabel = (
  link.innerText ||
  link.getAttribute("aria-label") ||
  link.title ||
  "CTA Button"
)
  .trim()
  .replace(/\s+/g, " ")
  .slice(0, 100);

const ctaId =
  link.id ||
  link.getAttribute("data-cta-id") ||
  "";

// Send CTA information to backend
redirectUrl.searchParams.set("ctaLabel", ctaLabel);

if (ctaId) {
  redirectUrl.searchParams.set("ctaId", ctaId);
}

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

    // =====================================================
    // AFFILIATE NETWORK INTEGRATIONS
    // =====================================================

    const affiliateNetworksCollection = client
      .db("affiliate-ai")
      .collection("affiliate-networks");

    // =====================================================
    // AFFILIATE OFFER TRACKING
    // =====================================================

    const trackingOffersCollection = client
      .db("affiliate-ai")
      .collection("tracking-offers");

    const trackingLandingPageOffersCollection = client
      .db("affiliate-ai")
      .collection("tracking-landing-page-offers");

    // =====================================================
    // TRACKING LANDING PAGE OFFERS INDEXES
    // =====================================================

    // Find offers connected to a landing page
    await trackingLandingPageOffersCollection.createIndex({
      ownerEmail: 1,
      landingPageId: 1,
    });

    // Find landing pages connected to an offer
    await trackingLandingPageOffersCollection.createIndex({
      ownerEmail: 1,
      offerId: 1,
    });

    // Prevent duplicate offer assignment
    await trackingLandingPageOffersCollection.createIndex(
      {
        ownerEmail: 1,
        landingPageId: 1,
        offerId: 1,
      },
      {
        unique: true,
      },
    );

    // User-wise network integration lookup
    await affiliateNetworksCollection.createIndex({
      email: 1,
      createdAt: -1,
    });

    // Unique integration ID
    await affiliateNetworksCollection.createIndex(
      { integrationId: 1 },
      { unique: true },
    );

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

    // Owner-wise conversion reports
    await trackingConversionsCollection.createIndex({
      ownerEmail: 1,
      createdAt: -1,
    });

    // Offer-wise conversion reports
    await trackingConversionsCollection.createIndex({
      offerId: 1,
      createdAt: -1,
    });

    // =====================================================
    // TRACKING OFFERS INDEXES
    // =====================================================

    // Unique Offer ID
    await trackingOffersCollection.createIndex(
      { offerId: 1 },
      { unique: true },
    );

    // User-wise Offer lookup
    await trackingOffersCollection.createIndex({
      ownerEmail: 1,
      createdAt: -1,
    });

    // Affiliate Network-wise Offer lookup
    await trackingOffersCollection.createIndex({
      integrationId: 1,
      ownerEmail: 1,
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
          networkName = "",
          productName = "",
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
        // AFFILIATE OFFER DETAILS
        // =====================================================

        const cleanNetworkName =
          typeof networkName === "string"
            ? networkName.trim().slice(0, 100)
            : "";

        const cleanProductName =
          typeof productName === "string"
            ? productName.trim().slice(0, 150)
            : "";

        // =====================================================
        // CHECK AFFILIATE OFFER DETAILS
        // =====================================================

        const shouldCreateOffer =
          Boolean(affiliateLink.trim()) &&
          Boolean(cleanNetworkName) &&
          Boolean(cleanProductName);
        // =====================================================
        // INTENT
        // =====================================================

        const cleanIntent =
          typeof intent === "string" ? intent.trim().slice(0, 60) : "";

        // =====================================================
        // PREPARE HTML
        // =====================================================

        // let finalHTML = prepareLandingHTML(html, affiliateLink);

        // finalHTML = makeImageUrlsAbsolute(finalHTML);

        let finalHTML = "";

        const now = new Date();

        // =====================================================
        // CREATE / REUSE TRACKING OFFER
        // =====================================================

        const createOrReuseTrackingOffer = async (landingPageId) => {
          if (!shouldCreateOffer) return null;

          const ownerEmail = String(email).trim().toLowerCase();

          // Check whether this offer already exists
          let offer = await trackingOffersCollection.findOne({
            ownerEmail,
            networkName: cleanNetworkName,
            productName: cleanProductName,
            affiliateLink: affiliateLink.trim(),
          });

          // Create a new offer if it does not exist
          if (!offer) {
            offer = {
              offerId: new ObjectId().toString(),
              ownerEmail,
              integrationId: null,
              integrationStatus: "not_connected",
              networkName: cleanNetworkName,
              productName: cleanProductName,
              affiliateLink: affiliateLink.trim(),
              trackingParameter: DEFAULT_AFFILIATE_TRACKING_PARAMETER,
              status: "active",
              createdAt: new Date(),
              updatedAt: new Date(),
            };

            await trackingOffersCollection.insertOne(offer);
          }

          // Assign offer to landing page
          // await trackingLandingPageOffersCollection.updateOne(
          //   {
          //     ownerEmail,
          //     landingPageId: String(landingPageId),
          //     offerId: offer.offerId,
          //   },
          //   {
          //     $setOnInsert: {
          //       ownerEmail,
          //       landingPageId: String(landingPageId),
          //       offerId: offer.offerId,
          //       productName: offer.productName,
          //       networkName: offer.networkName,
          //       integrationId: null,
          //       status: "active",
          //       createdAt: new Date(),
          //       updatedAt: new Date(),
          //     },
          //   },
          //   { upsert: true },
          // );

          // Assign offer only when landingPageId is available
          if (landingPageId) {
            await trackingLandingPageOffersCollection.updateOne(
              {
                ownerEmail,
                landingPageId: String(landingPageId),
                offerId: offer.offerId,
              },
              {
                $setOnInsert: {
                  ownerEmail,
                  landingPageId: String(landingPageId),
                  offerId: offer.offerId,
                  productName: offer.productName,
                  networkName: offer.networkName,
                  integrationId: null,
                  status: "active",
                  createdAt: new Date(),
                  updatedAt: new Date(),
                },
              },
              { upsert: true },
            );
          }
          return offer;
        };

        // =====================================================
        // CREATE / REUSE OFFER BEFORE PREPARING HTML
        // =====================================================

        const offerForHTML = await createOrReuseTrackingOffer(null);

        finalHTML = prepareLandingHTML(
          html,
          affiliateLink,
          offerForHTML?.offerId || null,
        );

        finalHTML = makeImageUrlsAbsolute(finalHTML);

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

          // Create or reuse offer and assign it to existing landing page
          const trackingOffer = await createOrReuseTrackingOffer(
            existingPage._id.toString(),
          );
          // Keep the existing slug and public URL unchanged
          const liveURL = `${cleanBaseURL}/${existingPage.slug}`;

          // return res.json({
          //   success: true,
          //   action: "updated",
          //   slug: existingPage.slug,
          //   intent: cleanIntent,
          //   url: liveURL,
          // });

          return res.json({
            success: true,
            action: "updated",
            slug: existingPage.slug,
            landingPageId: existingPage._id.toString(),
            intent: cleanIntent,
            url: liveURL,
            offer: trackingOffer
              ? {
                  offerId: trackingOffer.offerId,
                  productName: trackingOffer.productName,
                  networkName: trackingOffer.networkName,
                  integrationStatus: trackingOffer.integrationStatus,
                }
              : null,
          });
        }

        // =====================================================
        // CREATE NEW PAGE
        // =====================================================

        // let slug;
        // let inserted = false;

        let slug;
        let inserted = false;
        let trackingOffer = null;
        let landingPageId = null;

        // =====================================================
        // GENERATE UNIQUE SLUG
        //
        // Example:
        // insurance-117bc58e2a
        // =====================================================

        for (let attempt = 0; attempt < 10; attempt++) {
          slug = createPublicLandingSlug(cleanIntent);

          try {
            // await landingPagesCollection.insertOne({
            //   name: pageName,

            //   slug,

            //   html: finalHTML,

            //   affiliateLink: affiliateLink || "",

            //   // Affiliate tracking configuration
            //   trackingParameter: DEFAULT_AFFILIATE_TRACKING_PARAMETER,

            //   intent: cleanIntent,

            //   status: "published",

            //   campaignId: null,

            //   // Analytics
            //   views: 0,
            //   clicks: 0,

            //   createdAt: now,
            //   updatedAt: now,

            //   email,
            // });

            const insertResult = await landingPagesCollection.insertOne({
              name: pageName,
              slug,
              html: finalHTML,
              affiliateLink: affiliateLink || "",
              trackingParameter: DEFAULT_AFFILIATE_TRACKING_PARAMETER,
              intent: cleanIntent,
              status: "published",
              campaignId: null,
              views: 0,
              clicks: 0,
              createdAt: now,
              updatedAt: now,
              email,
            });

            // Save the newly created landing page ID
            landingPageId = insertResult.insertedId.toString();

            // Create or reuse offer and assign it to new landing page
            trackingOffer = await createOrReuseTrackingOffer(landingPageId);

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

        // return res.status(201).json({
        //   success: true,
        //   action: "created",
        //   slug,
        //   intent: cleanIntent,
        //   url: liveURL,
        // });

        return res.status(201).json({
          success: true,
          action: "created",
          slug,
          landingPageId,
          intent: cleanIntent,
          url: liveURL,
          offer: trackingOffer
            ? {
                offerId: trackingOffer.offerId,
                productName: trackingOffer.productName,
                networkName: trackingOffer.networkName,
                integrationStatus: trackingOffer.integrationStatus,
              }
            : null,
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

        let ownerEmail = null;

        if (!landingPageId || !ObjectId.isValid(String(landingPageId))) {
          return res.status(400).json({
            success: false,
            error: "Invalid landing page ID",
          });
        }

        const landingPage = await landingPagesCollection.findOne(
          {
            _id: new ObjectId(String(landingPageId)),
            status: "published",
          },
          {
            projection: {
              email: 1,
            },
          },
        );

        if (!landingPage) {
          return res.status(404).json({
            success: false,
            error: "Landing page not found",
          });
        }

        ownerEmail = landingPage.email;

        if (!ownerEmail) {
          return res.status(400).json({
            success: false,
            error: "Landing page owner not found",
          });
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

    /* =========================================================
   CREATE AFFILIATE TRACKING CLICK
========================================================= */

    app.get("/api/tracking/redirect", async (req, res) => {
      try {
        const clickId =
          typeof req.query.clickId === "string" ? req.query.clickId.trim() : "";

        const offerId =
          typeof req.query.offerId === "string" ? req.query.offerId.trim() : "";

        const ctaLabel =
          typeof req.query.ctaLabel === "string"
            ? req.query.ctaLabel.trim().slice(0, 100)
            : "CTA Button";

        const ctaId =
          typeof req.query.ctaId === "string"
            ? req.query.ctaId.trim().slice(0, 100)
            : null;

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
              ownerEmail: 1,
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

        // STEP 10.10: VERIFY OFFER ASSIGNMENT

        if (!offerId || !/^[a-f0-9]{24}$/i.test(offerId)) {
          return res.status(400).send("Invalid offer ID");
        }

        if (!click.ownerEmail) {
          return res.status(400).send("Click owner not found");
        }

        // Verify that this offer is assigned to this landing page
        const offerAssignment =
          await trackingLandingPageOffersCollection.findOne({
            ownerEmail: click.ownerEmail,
            landingPageId: String(click.landingPageId),
            offerId,
            status: "active",
          });

        if (!offerAssignment) {
          return res
            .status(404)
            .send("Offer is not assigned to this landing page");
        }

        // Get the actual offer
        const offer = await trackingOffersCollection.findOne({
          ownerEmail: click.ownerEmail,
          offerId,
          status: "active",
        });

        if (!offer) {
          return res.status(404).send("Active affiliate offer not found");
        }

        // =====================================================
        // VALIDATE AFFILIATE LINK
        // =====================================================

        // const affiliateLink =
        //   typeof landingPage.affiliateLink === "string"
        //     ? landingPage.affiliateLink.trim()
        //     : "";

        const affiliateLink =
          typeof offer.affiliateLink === "string"
            ? offer.affiliateLink.trim()
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
          // trackingParameter:
          //   landingPage.trackingParameter ||
          //   DEFAULT_AFFILIATE_TRACKING_PARAMETER,
          trackingParameter:
            offer.trackingParameter || DEFAULT_AFFILIATE_TRACKING_PARAMETER,
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
                offerId: offer.offerId,
                networkName: offer.networkName,
                productName: offer.productName,
                affiliateLink,
                affiliateRedirectedAt: new Date(),
                ctaLabel,
                ctaId,
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

    // =====================================================
    // SAVE AFFILIATE NETWORK INTEGRATION
    // =====================================================

    app.post("/api/tracking/networks", async (req, res) => {
      try {
        const {
          email,
          networkName,
          clickIdParameter,
          payoutParameter,
          transactionIdParameter,
          statusParameter,
          eventTypeParameter,
          eventMappings,
        } = req.body;

        if (!email || !networkName || !clickIdParameter || !payoutParameter) {
          return res.status(400).json({
            success: false,
            error:
              "Email, network name, click ID parameter and payout parameter are required",
          });
        }

        const integrationId = new ObjectId().toString();

        const postbackSecret = generateTrackingClickId().replace(/^cl_/, "");

        const integration = {
          integrationId,
          postbackSecret,
          email: String(email).trim().toLowerCase(),
          networkName: String(networkName).trim(),

          parameters: {
            clickId: String(clickIdParameter).trim(),
            payout: String(payoutParameter).trim(),
            transactionId: String(
              transactionIdParameter || "transaction_id",
            ).trim(),
            status: String(statusParameter || "status").trim(),
            eventType: String(eventTypeParameter || "").trim() || null,
          },

          eventMappings: {
            lead: ["lead", "signup", "registration"],
            purchase: ["sale", "purchase"],
            ...(eventMappings || {}),
          },

          status: "active",
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        await affiliateNetworksCollection.insertOne(integration);

        return res.status(201).json({
          success: true,
          message: "Affiliate network integration saved successfully",
          integration: {
            integrationId: integration.integrationId,
            networkName: integration.networkName,
            parameters: integration.parameters,
            status: integration.status,
            postbackUrl: `${req.protocol}://${req.get("host")}/api/tracking/postback?integrationId=${encodeURIComponent(integrationId)}&key=${postbackSecret}`,
          },
        });
      } catch (error) {
        console.error("Save affiliate network error:", error);

        return res.status(500).json({
          success: false,
          error: "Failed to save affiliate network integration",
        });
      }
    });

    // GET USER'S AFFILIATE NETWORK INTEGRATIONS
    app.get("/api/tracking/networks", async (req, res) => {
      try {
        const email =
          typeof req.query.email === "string"
            ? req.query.email.trim().toLowerCase()
            : "";

        if (!email) {
          return res.status(400).json({
            success: false,
            error: "Email is required",
          });
        }

        const integrations = await affiliateNetworksCollection
          .find(
            { email },
            {
              projection: {
                _id: 0,
                integrationId: 1,
                networkName: 1,
                parameters: 1,
                eventMappings: 1,
                status: 1,
                createdAt: 1,
                updatedAt: 1,
              },
            },
          )
          .sort({ createdAt: -1 })
          .toArray();

        return res.status(200).json({
          success: true,
          totalIntegrations: integrations.length,
          integrations,
        });
      } catch (error) {
        console.error("Get affiliate networks error:", error);

        return res.status(500).json({
          success: false,
          error: "Failed to fetch affiliate network integrations",
        });
      }
    });

    // UPDATE AFFILIATE NETWORK INTEGRATION
    app.put("/api/tracking/networks/:integrationId", async (req, res) => {
      try {
        const { integrationId } = req.params;

        const {
          email,
          networkName,
          clickIdParameter,
          payoutParameter,
          transactionIdParameter,
          statusParameter,
          eventTypeParameter,
          eventMappings,
        } = req.body;

        if (!email || !integrationId) {
          return res.status(400).json({
            success: false,
            error: "Email and integration ID are required",
          });
        }

        const ownerEmail = String(email).trim().toLowerCase();

        const existingIntegration = await affiliateNetworksCollection.findOne({
          integrationId,
          email: ownerEmail,
        });

        if (!existingIntegration) {
          return res.status(404).json({
            success: false,
            error: "Affiliate network integration not found",
          });
        }

        const updateData = {};

        if (networkName !== undefined) {
          if (!String(networkName).trim()) {
            return res.status(400).json({
              success: false,
              error: "Network name cannot be empty",
            });
          }

          updateData.networkName = String(networkName).trim();
        }

        const parameters = {
          ...(existingIntegration.parameters || {}),
        };

        if (clickIdParameter !== undefined) {
          parameters.clickId = String(clickIdParameter).trim();
        }

        if (payoutParameter !== undefined) {
          parameters.payout = String(payoutParameter).trim();
        }

        if (transactionIdParameter !== undefined) {
          parameters.transactionId = String(transactionIdParameter).trim();
        }

        if (statusParameter !== undefined) {
          parameters.status = String(statusParameter).trim();
        }

        if (eventTypeParameter !== undefined) {
          parameters.eventType = String(eventTypeParameter).trim() || null;
        }

        updateData.parameters = parameters;

        if (eventMappings !== undefined) {
          updateData.eventMappings = eventMappings;
        }

        updateData.updatedAt = new Date();

        await affiliateNetworksCollection.updateOne(
          {
            integrationId,
            email: ownerEmail,
          },
          {
            $set: updateData,
          },
        );

        return res.status(200).json({
          success: true,
          message: "Affiliate network integration updated successfully",
          integrationId,
        });
      } catch (error) {
        console.error("Update affiliate network error:", error);

        return res.status(500).json({
          success: false,
          error: "Failed to update affiliate network integration",
        });
      }
    });

    // =====================================================
    // CREATE AFFILIATE TRACKING OFFER
    // =====================================================

    app.post("/api/tracking/offers", async (req, res) => {
      try {
        const {
          email,
          integrationId,
          productName,
          affiliateLink,
          trackingParameter,
        } = req.body;

        // 1. Validate required fields
        if (!email || !integrationId || !productName || !affiliateLink) {
          return res.status(400).json({
            success: false,
            error:
              "Email, integration ID, product name and affiliate link are required",
          });
        }

        const ownerEmail = String(email).trim().toLowerCase();

        // 2. Validate affiliate URL
        if (!isValidHttpUrl(String(affiliateLink).trim())) {
          return res.status(400).json({
            success: false,
            error: "Invalid affiliate link",
          });
        }

        // 3. Find owner's affiliate network integration
        const integration = await affiliateNetworksCollection.findOne({
          integrationId: String(integrationId).trim(),
          email: ownerEmail,
          status: "active",
        });

        if (!integration) {
          return res.status(404).json({
            success: false,
            error: "Active affiliate network integration not found",
          });
        }

        // 4. Create Offer
        const offer = {
          offerId: new ObjectId().toString(),

          ownerEmail,

          integrationId: integration.integrationId,
          networkName: integration.networkName,

          productName: String(productName).trim(),

          affiliateLink: String(affiliateLink).trim(),

          trackingParameter: normalizeTrackingParameter(trackingParameter),

          status: "active",

          createdAt: new Date(),
          updatedAt: new Date(),
        };

        // 5. Save Offer
        await trackingOffersCollection.insertOne(offer);

        // 6. Response
        return res.status(201).json({
          success: true,
          message: "Affiliate offer created successfully",

          offer: {
            offerId: offer.offerId,
            productName: offer.productName,
            networkName: offer.networkName,
            integrationId: offer.integrationId,
            trackingParameter: offer.trackingParameter,
            status: offer.status,
            createdAt: offer.createdAt,
          },
        });
      } catch (error) {
        console.error("Create affiliate offer error:", error);

        return res.status(500).json({
          success: false,
          error: "Failed to create affiliate offer",
        });
      }
    });

    // =====================================================
    // GET ALL AFFILIATE TRACKING OFFERS
    // =====================================================

    app.get("/api/tracking/offers", async (req, res) => {
      try {
        const email =
          typeof req.query.email === "string"
            ? req.query.email.trim().toLowerCase()
            : "";

        if (!email) {
          return res.status(400).json({
            success: false,
            error: "Email is required",
          });
        }

        // Find offers belonging to this user
        const offers = await trackingOffersCollection
          .find({
            ownerEmail: email,
          })
          .sort({
            createdAt: -1,
          })
          .project({
            _id: 0,
            offerId: 1,
            productName: 1,
            networkName: 1,
            integrationId: 1,
            affiliateLink: 1,
            trackingParameter: 1,
            status: 1,
            createdAt: 1,
            updatedAt: 1,
          })
          .toArray();

        return res.status(200).json({
          success: true,
          totalOffers: offers.length,
          offers,
        });
      } catch (error) {
        console.error("Get affiliate offers error:", error);

        return res.status(500).json({
          success: false,
          error: "Failed to fetch affiliate offers",
        });
      }
    });

    // =====================================================
    // UPDATE AFFILIATE TRACKING OFFER
    // =====================================================

    app.put("/api/tracking/offers/:offerId", async (req, res) => {
      try {
        const { offerId } = req.params;

        const { email, productName, affiliateLink, trackingParameter, status } =
          req.body;

        const ownerEmail =
          typeof email === "string" ? email.trim().toLowerCase() : "";

        if (!ownerEmail || !offerId) {
          return res.status(400).json({
            success: false,
            error: "Email and offer ID are required",
          });
        }

        // Find existing offer owned by this user
        const existingOffer = await trackingOffersCollection.findOne({
          offerId,
          ownerEmail,
        });

        if (!existingOffer) {
          return res.status(404).json({
            success: false,
            error: "Offer not found",
          });
        }

        const updateFields = {};

        // Update product name
        if (productName !== undefined) {
          if (typeof productName !== "string" || !productName.trim()) {
            return res.status(400).json({
              success: false,
              error: "Invalid product name",
            });
          }

          updateFields.productName = productName.trim();
        }

        // Update affiliate link
        if (affiliateLink !== undefined) {
          if (
            typeof affiliateLink !== "string" ||
            !isValidHttpUrl(affiliateLink.trim())
          ) {
            return res.status(400).json({
              success: false,
              error: "Invalid affiliate link",
            });
          }

          updateFields.affiliateLink = affiliateLink.trim();
        }

        // Update tracking parameter
        if (trackingParameter !== undefined) {
          updateFields.trackingParameter =
            normalizeTrackingParameter(trackingParameter);
        }

        // Update offer status
        if (status !== undefined) {
          if (!["active", "inactive"].includes(status)) {
            return res.status(400).json({
              success: false,
              error: "Status must be active or inactive",
            });
          }

          updateFields.status = status;
        }

        if (Object.keys(updateFields).length === 0) {
          return res.status(400).json({
            success: false,
            error: "No fields provided to update",
          });
        }

        updateFields.updatedAt = new Date();

        await trackingOffersCollection.updateOne(
          {
            offerId,
            ownerEmail,
          },
          {
            $set: updateFields,
          },
        );

        const updatedOffer = await trackingOffersCollection.findOne(
          {
            offerId,
            ownerEmail,
          },
          {
            projection: {
              _id: 0,
              offerId: 1,
              productName: 1,
              networkName: 1,
              integrationId: 1,
              affiliateLink: 1,
              trackingParameter: 1,
              status: 1,
              createdAt: 1,
              updatedAt: 1,
            },
          },
        );

        return res.status(200).json({
          success: true,
          message: "Affiliate offer updated successfully",
          offer: updatedOffer,
        });
      } catch (error) {
        console.error("Update affiliate offer error:", error);

        return res.status(500).json({
          success: false,
          error: "Failed to update affiliate offer",
        });
      }
    });

    // =====================================================
    // ASSIGN OFFER TO LANDING PAGE
    // =====================================================

    app.post("/api/tracking/landing-page-offers", async (req, res) => {
      try {
        const { email, landingPageId, offerId } = req.body;

        const ownerEmail =
          typeof email === "string" ? email.trim().toLowerCase() : "";

        if (!ownerEmail || !landingPageId || !offerId) {
          return res.status(400).json({
            success: false,
            error: "Email, landing page ID and offer ID are required",
          });
        }

        // Validate Landing Page ID
        if (!ObjectId.isValid(String(landingPageId))) {
          return res.status(400).json({
            success: false,
            error: "Invalid landing page ID",
          });
        }

        const normalizedLandingPageId = String(landingPageId);

        // Find Landing Page owned by this user
        const landingPage = await landingPagesCollection.findOne({
          _id: new ObjectId(normalizedLandingPageId),
          email: ownerEmail,
        });

        if (!landingPage) {
          return res.status(404).json({
            success: false,
            error: "Landing page not found",
          });
        }

        // Find active Offer owned by this user
        const offer = await trackingOffersCollection.findOne({
          offerId: String(offerId).trim(),
          ownerEmail,
          status: "active",
        });

        if (!offer) {
          return res.status(404).json({
            success: false,
            error: "Active offer not found",
          });
        }

        // Save Landing Page - Offer relationship
        const assignment = {
          ownerEmail,
          landingPageId: normalizedLandingPageId,
          offerId: offer.offerId,
          productName: offer.productName,
          networkName: offer.networkName,
          integrationId: offer.integrationId,
          status: "active",
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        await trackingLandingPageOffersCollection.insertOne(assignment);

        return res.status(201).json({
          success: true,
          message: "Offer assigned to landing page successfully",
          assignment: {
            landingPageId: normalizedLandingPageId,
            offerId: offer.offerId,
            productName: offer.productName,
            networkName: offer.networkName,
          },
        });
      } catch (error) {
        // Duplicate assignment protection
        if (error.code === 11000) {
          return res.status(409).json({
            success: false,
            error: "This offer is already assigned to this landing page",
          });
        }

        console.error("Assign offer error:", error);

        return res.status(500).json({
          success: false,
          error: "Failed to assign offer to landing page",
        });
      }
    });

    // =====================================================
    // GET OFFERS ASSIGNED TO A LANDING PAGE
    // =====================================================

    app.get("/api/tracking/landing-page-offers", async (req, res) => {
      try {
        const email =
          typeof req.query.email === "string"
            ? req.query.email.trim().toLowerCase()
            : "";

        const landingPageId =
          typeof req.query.landingPageId === "string"
            ? req.query.landingPageId.trim()
            : "";

        if (!email || !landingPageId) {
          return res.status(400).json({
            success: false,
            error: "Email and landing page ID are required",
          });
        }

        if (!ObjectId.isValid(landingPageId)) {
          return res.status(400).json({
            success: false,
            error: "Invalid landing page ID",
          });
        }

        // Verify Landing Page ownership
        const landingPage = await landingPagesCollection.findOne({
          _id: new ObjectId(landingPageId),
          email,
        });

        if (!landingPage) {
          return res.status(404).json({
            success: false,
            error: "Landing page not found",
          });
        }

        // Get assigned offers
        const assignments = await trackingLandingPageOffersCollection
          .find({
            ownerEmail: email,
            landingPageId,
            status: "active",
          })
          .sort({
            createdAt: -1,
          })
          .project({
            _id: 0,
            landingPageId: 1,
            offerId: 1,
            productName: 1,
            networkName: 1,
            integrationId: 1,
            status: 1,
            createdAt: 1,
          })
          .toArray();

        return res.status(200).json({
          success: true,
          totalOffers: assignments.length,
          offers: assignments,
        });
      } catch (error) {
        console.error("Get assigned offers error:", error);

        return res.status(500).json({
          success: false,
          error: "Failed to fetch assigned offers",
        });
      }
    });

    /* =========================================================
   AFFILIATE CONVERSION POSTBACK (S2S)
   ========================================================= */

    app.get("/api/tracking/postback", async (req, res) => {
      try {
        // 1. Get integration information
        const { integrationId, key } = req.query;

        if (typeof integrationId !== "string" || typeof key !== "string") {
          return res.status(400).json({
            success: false,
            error: "Integration ID and key are required",
          });
        }

        // 2. Find affiliate network integration
        const integration = await affiliateNetworksCollection.findOne({
          integrationId,
          status: "active",
        });

        if (!integration) {
          return res.status(404).json({
            success: false,
            error: "Affiliate network integration not found or inactive",
          });
        }

        // 3. Validate integration-specific secret
        const savedSecret = integration.postbackSecret;

        if (
          !savedSecret ||
          key.length !== savedSecret.length ||
          !crypto.timingSafeEqual(Buffer.from(key), Buffer.from(savedSecret))
        ) {
          return res.status(401).json({
            success: false,
            error: "Invalid postback authentication",
          });
        }

        // 4. Read dynamic parameter names
        const parameters = integration.parameters || {};

        const getParameter = (parameterName) => {
          if (!parameterName) return undefined;

          const value = req.query[parameterName];

          return typeof value === "string" ? value : undefined;
        };

        const clickId = getParameter(parameters.clickId);
        const payout = getParameter(parameters.payout) ?? "0";
        const txid = getParameter(parameters.transactionId);
        const status = getParameter(parameters.status) ?? "approved";

        // Dynamic Event Type
        const rawEventType = parameters.eventType
          ? getParameter(parameters.eventType)
          : null;

        const normalizedEventType = rawEventType
          ? rawEventType.toLowerCase().trim()
          : "unknown";

        // const allowedEventTypes = [
        //   "lead",
        //   "sale",
        //   "purchase",
        //   "registration",
        //   "signup",
        //   "install",
        //   "deposit",
        //   "unknown",
        // ];

        // if (!allowedEventTypes.includes(normalizedEventType)) {
        //   return res.status(400).json({
        //     success: false,
        //     error: "Unsupported event type",
        //   });
        // }

        // const eventType =
        //   normalizedEventType === "purchase" ? "sale" : normalizedEventType;

        // 1. Get event mappings

        // const eventMappings = integration.eventMappings || {};

        // Validate event using this integration's mappings
        const eventMappings = integration.eventMappings || {};

        const allowedEventTypes = [
          ...(eventMappings.lead || []),
          ...(eventMappings.purchase || []),
        ].map((event) => String(event).toLowerCase().trim());

        if (
          normalizedEventType !== "unknown" &&
          !allowedEventTypes.includes(normalizedEventType)
        ) {
          return res.status(400).json({
            success: false,
            error: "Unsupported event type for this network",
          });
        }

        const leadEvents = (eventMappings.lead || []).map((event) =>
          String(event).toLowerCase().trim(),
        );

        const purchaseEvents = (eventMappings.purchase || []).map((event) =>
          String(event).toLowerCase().trim(),
        );

        // 2. Classify incoming event
        let eventCategory = "unknown";

        if (leadEvents.includes(normalizedEventType)) {
          eventCategory = "lead";
        } else if (purchaseEvents.includes(normalizedEventType)) {
          eventCategory = "purchase";
        }

        // 5. Validate click ID
        if (
          typeof clickId !== "string" ||
          !/^cl_[a-f0-9]{32}$/i.test(clickId)
        ) {
          return res.status(400).json({
            success: false,
            error: "Invalid click ID",
          });
        }

        // 6. Validate payout
        const revenue = Number(payout);

        if (!Number.isFinite(revenue) || revenue < 0) {
          return res.status(400).json({
            success: false,
            error: "Invalid payout amount",
          });
        }

        // 7. Validate transaction ID
        const transactionId =
          typeof txid === "string" && txid.trim() ? txid.trim() : clickId;

        if (transactionId.length > 200) {
          return res.status(400).json({
            success: false,
            error: "Invalid transaction ID",
          });
        }

        // 8. Normalize conversion status
        const rawStatus = String(status).toLowerCase().trim();

        // const statusMap = {
        //   approved: "approved",
        //   confirmed: "approved",
        //   sale: "approved",
        //   lead: "approved",
        //   pending: "pending",
        //   declined: "declined",
        //   rejected: "declined",
        //   cancelled: "declined",
        // };

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

        // 9. Find original tracking click
        const click = await trackingClicksCollection.findOne({
          clickId,
        });

        if (!click) {
          return res.status(404).json({
            success: false,
            error: "Tracking click not found",
          });
        }

        // 10. Verify click ownership
        if (
          !click.ownerEmail ||
          click.ownerEmail.toLowerCase() !== integration.email.toLowerCase()
        ) {
          return res.status(403).json({
            success: false,
            error: "This click does not belong to this integration owner",
          });
        }

        // STEP 10.17: VERIFY OFFER OWNERSHIP AND INTEGRATION

        if (!click.offerId) {
          return res.status(400).json({
            success: false,
            error: "No affiliate offer is associated with this click",
          });
        }

        const linkedOffer = await trackingOffersCollection.findOne({
          ownerEmail: click.ownerEmail,
          offerId: click.offerId,
          status: "active",
        });

        if (!linkedOffer) {
          return res.status(404).json({
            success: false,
            error: "Associated affiliate offer not found or inactive",
          });
        }

        // If the offer has a connected integration, verify it
        if (
          linkedOffer.integrationId &&
          linkedOffer.integrationId !== integrationId
        ) {
          return res.status(403).json({
            success: false,
            error: "This integration is not connected to the clicked offer",
          });
        }

        const now = new Date();

        // 11. Find existing conversion
        const conversionFilter = {
          clickId,
          transactionId,
        };

        const existingConversion =
          await trackingConversionsCollection.findOne(conversionFilter);

        // Check exact duplicate postback
        if (
          existingConversion &&
          existingConversion.integrationId === integrationId &&
          existingConversion.status === conversionStatus &&
          Number(existingConversion.payout || 0) === revenue &&
          existingConversion.eventType === normalizedEventType &&
          existingConversion.eventCategory === eventCategory
        ) {
          return res.status(200).json({
            success: true,
            duplicate: true,
            message: "Duplicate postback ignored. No update required.",
            conversionId: existingConversion.conversionId,
            transactionId,
          });
        }

        const oldRevenue =
          existingConversion?.status === "approved"
            ? Number(existingConversion.payout || 0)
            : 0;

        const newRevenue = conversionStatus === "approved" ? revenue : 0;

        const revenueDifference = newRevenue - oldRevenue;

        const conversionId =
          existingConversion?.conversionId ||
          `cv_${crypto.randomBytes(16).toString("hex")}`;

        // 12. Save or update conversion
        // const conversionData = {
        //   conversionId,
        //   clickId,
        //   transactionId,
        //   integrationId,
        //   eventType: normalizedEventType,
        //   eventCategory,
        //   networkName: integration.networkName,
        //   campaignId: click.campaignId || null,
        //   landingPageId: click.landingPageId || null,
        //   ownerEmail: click.ownerEmail,
        //   payout: revenue,
        //   status: conversionStatus,
        //   trafficSource: click.utm?.source || null,
        //   updatedAt: now,
        // };

        // 12. Save or update conversion

        const conversionData = {
          conversionId,
          clickId,
          transactionId,
          integrationId,

          // Offer information from original click
          offerId: click.offerId || null,
          networkName: click.networkName || integration.networkName,
          productName: click.productName || null,

          eventType: normalizedEventType,
          eventCategory,

          campaignId: click.campaignId || null,
          landingPageId: click.landingPageId || null,
          ownerEmail: click.ownerEmail,

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

        // 13. Update original click
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

        // 14. Update campaign statistics
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
              email: click.ownerEmail,
            },
            campaignUpdate,
          );
        }

        // 15. Success response
        return res.status(200).json({
          success: true,
          message: "Conversion tracked successfully",
          conversion: {
            conversionId,
            integrationId,
            networkName: integration.networkName,
            clickId,
            transactionId,
            payout: revenue,
            status: conversionStatus,
          },
        });
      } catch (error) {
        console.error("DYNAMIC CONVERSION POSTBACK ERROR:", error);

        return res.status(500).json({
          success: false,
          error: "Failed to process conversion",
        });
      }
    });

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
