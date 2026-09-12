

import puppeteer from "puppeteer";

import { getAmazonMarketplace } from "../../utils/amazonMarketplace.utils.js";

import { resolveAmazonCategories } from "./amazonCategory.service.js";

import { buildCategoryEngine } from "./amazonCategoryEngine.service.js";
// =====================================================
// Clean Product Name
// =====================================================

const cleanProductName = (name) => {
  if (!name) return null;

  return name.replace(/\s+/g, " ").trim();
};

// =====================================================
// Parse Rating
// =====================================================

const parseRating = (ratingText) => {
  if (!ratingText) return null;

  const match = ratingText.match(/(\d+(?:\.\d+)?)\s+out of 5 stars/i);

  return match ? Number(match[1]) : null;
};

// =====================================================
// Parse Reviews
// =====================================================

const parseReviews = (reviewsText) => {
  if (!reviewsText) return null;

  const cleaned = reviewsText.replace(/,/g, "").trim();

  const match = cleaned.match(/\d+/);

  return match ? Number(match[0]) : null;
};

// =====================================================
// Parse Price
// =====================================================

const parsePrice = (priceText) => {
  if (!priceText) return null;

  const match = priceText.match(/\$([\d,]+(?:\.\d{1,2})?)/);

  return match ? Number(match[1].replace(/,/g, "")) : null;
};

// =====================================================
// Scrape Amazon Products
// =====================================================

export const scrapeAmazonProducts = async (country) => {
  // ===================================================
  // 1. Get Amazon Marketplace
  // ===================================================

  const marketplace = getAmazonMarketplace(country);

  if (!marketplace) {
    throw new Error(`Unsupported Amazon marketplace for: ${country}`);
  }

  // ===================================================
  // 2. Launch Browser
  // ===================================================

  const browser = await puppeteer.launch({
    headless: true,

    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();

    // =================================================
    // 3. Browser Settings
    // =================================================

    await page.setViewport({
      width: 1366,
      height: 768,
    });

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
        "AppleWebKit/537.36 (KHTML, like Gecko) " +
        "Chrome/131.0.0.0 Safari/537.36",
    );

    // =================================================
    // 4. Discover Categories
    // =================================================

    const categories = await resolveAmazonCategories(page, marketplace.domain);

    // =================================================
    // 5. Store All Products
    // =================================================

    const allProducts = [];

    // =================================================
    // 6. Scrape Each Category
    // =================================================

    for (const category of categories) {
      await page.goto(category.url, {
        waitUntil: "domcontentloaded",

        timeout: 60000,
      });

      // ===============================================
      // Wait for Amazon
      // ===============================================

      await new Promise((resolve) => setTimeout(resolve, 3000));

      // ===============================================
      // Extract Products
      // ===============================================

      const products = await page.evaluate(() => {
        // -------------------------------------------
        // Find Product Cards
        // -------------------------------------------

        const items = [...document.querySelectorAll("[data-asin]")];

        return (
          items

            .map((item, index) => {
              // =====================================
              // ASIN
              // =====================================

              const asin = item.getAttribute("data-asin");

              // =====================================
              // Product URL
              // =====================================

              const linkElement =
                item.querySelector("a[href*='/dp/']") ||
                item.querySelector("a");

              const url = linkElement?.href || null;

              // =====================================
              // Product Image
              // =====================================

              const imageElement = item.querySelector("img");

              const image =
                imageElement?.src ||
                imageElement?.getAttribute("data-src") ||
                null;

              // =====================================
              // Product Title
              // =====================================

              const titleElement =
                item.querySelector(
                  "div._cDEzb_p13n-sc-css-line-clamp-3_g3dy1",
                ) ||
                item.querySelector("[class*='p13n-sc-css-line-clamp']") ||
                item.querySelector("a.a-link-normal");

              const name = titleElement?.innerText?.trim() || null;

              // =====================================
              // Rating
              // =====================================

              const ratingElement =
                item.querySelector("i.a-icon-star-small") ||
                item.querySelector("[class*='a-icon-star']");

              const ratingText = ratingElement?.innerText?.trim() || null;

              const rank = index + 1;

              // =====================================
              // Return Raw Product
              // =====================================

              return {
                rank,

                asin,

                name,

                ratingText,

                // url,

                // image,
              };
            })

            // -----------------------------------------
            // Remove Invalid Products
            // -----------------------------------------

            .filter((item) => item.asin && item.name)
        );
      });

      // =================================================
      // Normalize Products
      // =================================================

      const normalizedProducts = products.map((product) => ({
        rank: product.rank,

        asin: product.asin,

        name: cleanProductName(product.name),

        rating: parseRating(product.ratingText),

        url: product.url,

        image: product.image,

        category: category.key,

        categoryName: category.name,

        categoryUrl: category.url,
      }));

      console.log(
        `Found ${normalizedProducts.length} products from ${category.key}`,
      );

      // =================================================
      // Add Products
      // =================================================

      allProducts.push(...normalizedProducts);
    }

    // =================================================
    // 7. Remove Duplicate Products
    // =================================================

    const uniqueProducts = Array.from(
      new Map(allProducts.map((product) => [product.asin, product])).values(),
    );

    const categoryAnalysis = buildCategoryEngine(uniqueProducts);

    return {
      country,

      categoryAnalysis,
    };
  } finally {
    // =================================================
    // Close Browser
    // =================================================

    await browser.close();
  }
};
