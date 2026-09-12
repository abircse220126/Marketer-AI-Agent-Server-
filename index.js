require("dotenv").config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");
const cheerio = require("cheerio");
const puppeteer = require("puppeteer");
const { ApifyClient } = require("apify-client");
const { GoogleGenAI } = require("@google/genai");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
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
app.use(cors());
app.use(express.json());

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

    // const trendingOffersCollection = client
    //   .db("affiliate-ai")
    //   .collection("trending-offers");

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



    
    // no need this Api 




    app.post("/trending-offers", async (req, res) => {
      try {
        const { country } = req.body;
        if (!country) {
          return res.status(400).json({
            success: false,
            message: "Country name is required.",
          });
        }

        // const trendingData = await scrapeAmazonProducts(country);

        // const amazonTrendingData = JSON.stringify(trendingData, null, 2);

        // console.log("Amazon Trending Data:", amazonTrendingData);

        // const tiktokData = await scrapeTikTokProducts();

        // const tiktokData = await createTikTokSession()

        // console.log(tiktokData);

        const session = await createTikTokSession({ countryCode: "US" });

        console.log("TikTok session created");

        console.log(session);

        const result = await fetchAllTikTokTopAds({
          countryCode: "US",
          period: 30,
          limit: 20,
          apiHeaders: session.apiHeaders,
          cookieHeader: session.cookieHeader,
        });

        console.dir(result, { depth: null });

        const decisionData = createTikTokDecisionData(result.ads);


        // console.log("TikTok Decision Data:");

        // console.dir(decisionData, {
        //   depth: null,
        // });

        // console.log("TikTok Decision Data created");

        // console.log({
        //   totalAds: decisionData?.summary?.totalAds,

        //   topAds: decisionData?.topAds?.length,

        //   allAds: decisionData?.ads?.length,
        // });

        // ==========================================
        // 4. AI Analysis
        // ==========================================

        const aiIntelligence = await analyzeTikTokAdsWithAI(decisionData);

        console.log("TikTok AI Intelligence created");

        console.dir(aiIntelligence, {
          depth: null,
        });

        return res.status(200).json({
          success: true,

          country,

          // data: trendingData,
          // data: decisionData,

          data: {
            summary: decisionData.summary,

            statistics: decisionData.statistics,

            insights: decisionData.insights,

            topAds: decisionData.topAds,

            aiIntelligence,

            ads: decisionData.ads,
          },
        });
      } catch (error) {
        console.error(
          "🔥 TRENDING OFFER ERROR:",

          error,
        );

        return res.status(500).json({
          success: false,

          message: "Failed to collect trending offers.",

          error: error.message,
        });
      }
    });

    app.post("/projects", async (req, res) => {
      try {
        const { name } = req.body;

        const result = await projectCollection.insertOne({
          name,

          createdAt: new Date(),
        });

        res.json({
          success: true,
          projectId: result.insertedId,
        });
      } catch (err) {
        res.json({
          success: false,
        });
      }
    });

    app.get("/projects", async (req, res) => {
      const projects = await projectCollection
        .find()
        .sort({
          createdAt: -1,
        })
        .toArray();

      res.json(projects);
    });

    app.get("/project/:id", async (req, res) => {
      const analyses = await analysisCollection

        .find({
          projectId: req.params.id,
        })

        .sort({
          createdAt: -1,
        })

        .toArray();

      res.json({
        success: true,
        analyses,
      });
    });

    app.post("/save-competitor", async (req, res) => {
      const { competitorId } = req.body;

      const competitor = await competitorCollection.findOne({
        _id: new ObjectId(competitorId),
      });

      await savedCompetitorCollection.insertOne({
        ...competitor,

        savedAt: new Date(),
      });

      res.json({
        success: true,
      });
    });

    app.post("/favorite-analysis", async (req, res) => {
      const { analysisId } = req.body;

      await favoriteCollection.insertOne({
        analysisId,

        createdAt: new Date(),
      });

      res.json({
        success: true,
      });
    });

    app.post("/workspace", async (req, res) => {
      const { projectId, title } = req.body;

      const result = await workspaceCollection.insertOne({
        projectId,

        title,

        hooks: [],

        offers: [],

        ads: [],

        landingPages: [],

        campaigns: [],

        createdAt: new Date(),
      });

      res.json({
        success: true,
        id: result.insertedId,
      });
    });

    app.post("/workspace/hook", async (req, res) => {
      const { workspaceId, hook } = req.body;

      await workspaceCollection.updateOne(
        {
          _id: new ObjectId(workspaceId),
        },

        {
          $push: {
            hooks: hook,
          },
        },
      );

      res.json({
        success: true,
      });
    });

    app.post("/workspace/ad", async (req, res) => {
      const { workspaceId, ad } = req.body;

      await workspaceCollection.updateOne(
        {
          _id: new ObjectId(workspaceId),
        },

        {
          $push: {
            ads: ad,
          },
        },
      );

      res.json({
        success: true,
      });
    });

    app.get("/dashboard", async (req, res) => {
      const totalProjects = await projectCollection.countDocuments();

      const totalAnalysis = await analysisCollection.countDocuments();

      const totalCompetitors = await competitorCollection.countDocuments();

      res.json({
        totalProjects,

        totalAnalysis,

        totalCompetitors,
      });
    });

    app.post("/campaign-builder", async (req, res) => {
      try {
        const { product } = req.body;

        const result = await campaignBuilder(ai, product);

        res.json({
          success: true,

          data: result,
        });
      } catch (err) {
        res.json({
          success: false,
        });
      }
    });

    app.post("/campaign", async (req, res) => {
      try {
        const { product, projectId } = req.body;

        const campaign = await campaignRunner(ai, product);

        await campaignCollection.insertOne({
          product,

          projectId,

          campaign,

          createdAt: new Date(),
        });

        await workspaceCollection.updateOne(
          {
            projectId,
          },

          {
            $push: {
              campaigns: campaign,
            },
          },
        );

        res.json({
          success: true,

          campaign,
        });
      } catch (err) {
        res.json({
          success: false,
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
