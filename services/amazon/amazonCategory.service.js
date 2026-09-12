// import {
//   TARGET_AMAZON_CATEGORIES,
//   AMAZON_CATEGORY_FALLBACKS,
// } from "../../config/amazonCategories.config.js";

// // =====================================================
// // Normalize Text
// // =====================================================

// const normalizeText = (text) => {
//   return text?.toLowerCase().replace(/\s+/g, " ").trim() || "";
// };

// // =====================================================
// // Match Category
// // =====================================================

// const matchCategory = (text) => {
//   const normalizedText = normalizeText(text);

//   for (const category of TARGET_AMAZON_CATEGORIES) {
//     const matched = category.names.some((name) => {
//       const normalizedName = normalizeText(name);

//       return (
//         normalizedText === normalizedName ||
//         normalizedText.includes(normalizedName)
//       );
//     });

//     if (matched) {
//       return category.key;
//     }
//   }

//   return null;
// };

// // =====================================================
// // Discover Amazon Categories
// // =====================================================

// export const discoverAmazonCategories = async (page, marketplaceDomain) => {
//   const rootUrl = `https://www.${marketplaceDomain}/gp/bestsellers`;

//   console.log("======================================");

//   console.log("Opening Amazon Best Sellers:");

//   console.log(rootUrl);

//   console.log("======================================");

//   // ===================================================
//   // Open Amazon Best Sellers
//   // ===================================================

//   await page.goto(rootUrl, {
//     waitUntil: "domcontentloaded",

//     timeout: 60000,
//   });

//   // ===================================================
//   // Wait
//   // ===================================================

//   await new Promise((resolve) => setTimeout(resolve, 3000));

//   // ===================================================
//   // Extract Links
//   // ===================================================

//   const links = await page.evaluate(() => {
//     return [...document.querySelectorAll("a")]

//       .map((link) => ({
//         text: link.innerText?.trim() || "",

//         href: link.href || "",
//       }))

//       .filter((item) => item.text && item.href);
//   });

//   console.log("Total Amazon links found:", links.length);

//   // ===================================================
//   // Discover Categories
//   // ===================================================

//   const discoveredCategories = [];

//   for (const link of links) {
//     const categoryKey = matchCategory(link.text);

//     // Not our target category

//     if (!categoryKey) {
//       continue;
//     }

//     // Avoid duplicate categories

//     const alreadyExists = discoveredCategories.some(
//       (category) => category.key === categoryKey,
//     );

//     if (alreadyExists) {
//       continue;
//     }

//     discoveredCategories.push({
//       key: categoryKey,

//       name: link.text,

//       url: link.href,

//       source: "dynamic",
//     });
//   }

//   console.log("Discovered Categories:");

//   console.log(discoveredCategories);

//   return discoveredCategories;
// };

// // =====================================================
// // Resolve Final Amazon Categories
// // =====================================================

// export const resolveAmazonCategories = async (page, marketplaceDomain) => {
//   // ===================================================
//   // 1. Dynamic Discovery
//   // ===================================================

//   let discovered = [];

//   try {
//     discovered = await discoverAmazonCategories(page, marketplaceDomain);
//   } catch (error) {
//     console.error("Dynamic category discovery failed:", error.message);
//   }

//   // ===================================================
//   // 2. Get Fallback Config
//   // ===================================================

//   const fallback = AMAZON_CATEGORY_FALLBACKS[marketplaceDomain] || {};

//   // ===================================================
//   // 3. Target Categories
//   // ===================================================

//   const categoryKeys = ["fashion", "beauty", "health", "education", "shopping", "books", "fashion_style", "software", "gift_cards", "travel", "Romance"];

//   // ===================================================
//   // 4. Build Final Categories
//   // ===================================================

//   const finalCategories = [];

//   for (const key of categoryKeys) {
//     // -----------------------------------------------
//     // Dynamic Category
//     // -----------------------------------------------

//     const dynamicCategory = discovered.find((item) => item.key === key);

//     // -----------------------------------------------
//     // Fallback URL
//     // -----------------------------------------------

//     const fallbackUrl = fallback[key];

//     // -----------------------------------------------
//     // Dynamic has priority
//     // -----------------------------------------------

//     const finalUrl = dynamicCategory?.url || fallbackUrl;

//     // -----------------------------------------------
//     // No URL
//     // -----------------------------------------------

//     if (!finalUrl) {
//       console.log(`No URL found for category: ${key}`);

//       continue;
//     }

//     // -----------------------------------------------
//     // Save Final Category
//     // -----------------------------------------------

//     finalCategories.push({
//       key,

//       name: dynamicCategory?.name || key,

//       url: finalUrl,

//       source: dynamicCategory ? "dynamic" : "fallback",
//     });
//   }

//   // ===================================================
//   // Final Debug
//   // ===================================================

//   console.log("======================================");

//   console.log("FINAL AMAZON CATEGORIES");

//   console.log("======================================");

//   console.log(finalCategories);

//   return finalCategories;
// };

import {
  TARGET_AMAZON_CATEGORIES,
  AMAZON_CATEGORY_FALLBACKS,
} from "../../config/amazonCategories.config.js";

// =====================================================
// Normalize Text
// =====================================================

const normalizeText = (text) => {
  return text?.toLowerCase().replace(/\s+/g, " ").trim() || "";
};

// =====================================================
// Match Category
// =====================================================

const matchCategory = (text) => {
  const normalizedText = normalizeText(text);

  for (const category of TARGET_AMAZON_CATEGORIES) {
    const matched = category.names.some((name) => {
      const normalizedName = normalizeText(name);

      // Exact match only
      // অথবা text starts with category name

      return (
        normalizedText === normalizedName ||
        normalizedText.startsWith(normalizedName)
      );
    });

    if (matched) {
      return category.key;
    }
  }

  return null;
};

// =====================================================
// Check Valid Amazon Category URL
// =====================================================

const isAmazonCategoryUrl = (href) => {
  if (!href) {
    return false;
  }

  const normalizedUrl = href.toLowerCase();

  // Amazon Best Sellers category

  const isBestSeller =
    normalizedUrl.includes("/best-sellers-") ||
    normalizedUrl.includes("/Best-Sellers") ||
    normalizedUrl.includes("/Best-Seller") ||
    normalizedUrl.includes("/best-sellers/") ||
    normalizedUrl.includes("/zgbs/");

  // Amazon Gift Cards

  const isGiftCard = normalizedUrl.includes("/gift-cards/");

  return isBestSeller || isGiftCard;
};

// =====================================================
// Discover Amazon Categories
// =====================================================

export const discoverAmazonCategories = async (page, marketplaceDomain) => {
  const rootUrl = `https://www.${marketplaceDomain}/gp/bestsellers`;

  console.log("======================================");

  console.log("Opening Amazon Best Sellers:");

  console.log(rootUrl);

  console.log("======================================");

  // ===================================================
  // Open Amazon Best Sellers
  // ===================================================

  await page.goto(rootUrl, {
    waitUntil: "domcontentloaded",

    timeout: 60000,
  });

  // ===================================================
  // Wait
  // ===================================================

  await new Promise((resolve) => setTimeout(resolve, 3000));

  // ===================================================
  // Extract Only Category-Like Links
  // ===================================================

  const links = await page.evaluate(() => {
    return [...document.querySelectorAll("a")]

      .map((link) => ({
        text: link.innerText?.trim() || "",

        href: link.href || "",
      }))

      .filter((item) => item.text && item.href);
  });

  console.log("Total Amazon links found:", links.length);

  // ===================================================
  // Discover Categories
  // ===================================================

  const discoveredCategories = [];

  for (const link of links) {
    // -----------------------------------------------
    // Check URL
    // -----------------------------------------------

    const validCategoryUrl = isAmazonCategoryUrl(link.href);

    if (!validCategoryUrl) {
      continue;
    }

    // -----------------------------------------------
    // Match Category
    // -----------------------------------------------

    const categoryKey = matchCategory(link.text);

    // Not our target category

    if (!categoryKey) {
      continue;
    }

    // -----------------------------------------------
    // Avoid Duplicate
    // -----------------------------------------------

    const alreadyExists = discoveredCategories.some(
      (category) => category.key === categoryKey,
    );

    if (alreadyExists) {
      continue;
    }

    // -----------------------------------------------
    // Save Category
    // -----------------------------------------------

    discoveredCategories.push({
      key: categoryKey,

      name: link.text,

      url: link.href,

      source: "dynamic",
    });
  }

  console.log("======================================");

  console.log("Discovered Categories:");

  console.log(discoveredCategories);

  console.log("======================================");

  return discoveredCategories;
};

// =====================================================
// Resolve Final Amazon Categories
// =====================================================

export const resolveAmazonCategories = async (page, marketplaceDomain) => {
  // ===================================================
  // 1. Dynamic Discovery
  // ===================================================

  let discovered = [];

  try {
    discovered = await discoverAmazonCategories(page, marketplaceDomain);
  } catch (error) {
    console.error("Dynamic category discovery failed:", error.message);
  }

  // ===================================================
  // 2. Get Fallback Config
  // ===================================================

  const fallback = AMAZON_CATEGORY_FALLBACKS[marketplaceDomain] || {};

  // ===================================================
  // 3. Target Categories
  // ===================================================

  const categoryKeys = [
    "fashion",

    "beauty",

    "health",

    "education",

    "books",

    "fashion_style",

    "software",

    "gift_cards",

    "travel",

    "romance",
  ];

  // ===================================================
  // 4. Build Final Categories
  // ===================================================

  const finalCategories = [];

  for (const key of categoryKeys) {
    // -----------------------------------------------
    // Dynamic Category
    // -----------------------------------------------

    const dynamicCategory = discovered.find((item) => item.key === key);

    // -----------------------------------------------
    // Fallback URL
    // -----------------------------------------------

    const fallbackUrl = fallback[key];

    // -----------------------------------------------
    // Dynamic has Priority
    // -----------------------------------------------

    const finalUrl = dynamicCategory?.url || fallbackUrl;

    // -----------------------------------------------
    // No URL
    // -----------------------------------------------

    if (!finalUrl) {
      console.log(`No URL found for category: ${key}`);

      continue;
    }

    // -----------------------------------------------
    // Save Final Category
    // -----------------------------------------------

    finalCategories.push({
      key,

      name: dynamicCategory?.name || key,

      url: finalUrl,

      source: dynamicCategory ? "dynamic" : "fallback",
    });
  }

  // ===================================================
  // Final Debug
  // ===================================================

  console.log("======================================");

  console.log("FINAL AMAZON CATEGORIES");

  console.log("======================================");

  console.log(JSON.stringify(finalCategories, null, 2));

  return finalCategories;
};
