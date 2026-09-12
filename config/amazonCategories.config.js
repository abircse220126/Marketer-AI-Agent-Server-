export const TARGET_AMAZON_CATEGORIES = [
  // =====================================================
  // Fashion
  // =====================================================

  {
    key: "fashion",

    names: [
      "fashion",
      "clothing",
      "clothing, shoes & jewelry",
      "fashion & style",
      "fashion and style",
      "shoes",
      "jewelry",
      "watches",
    ],
  },


  // =====================================================
  // Beauty
  // =====================================================

  {
    key: "beauty",

    names: [
      "beauty",
      "beauty & personal care",
      "beauty and personal care",
      "personal care",
      "skin care",
      "skincare",
      "hair care",
      "makeup",
      "cosmetics",
    ],
  },


  // =====================================================
  // Health
  // =====================================================

  {
    key: "health",

    names: [
      "health",
      "health & personal care",
      "health and personal care",
      "health & household",
      "health and household",
      "medical",
      "vitamins",
      "supplements",
    ],
  },


  // =====================================================
  // Education
  // =====================================================

  {
    key: "education",

    names: [
      "education",
      "educational",
      "educational supplies",
      "school supplies",
      "learning",
    ],
  },


  // =====================================================
  // Shopping
  // =====================================================

  {
    key: "shopping",

    names: [
      "shopping",
      "shopping & retail",
      "retail",
    ],
  },


  // =====================================================
  // Books
  // =====================================================

  {
    key: "books",

    names: [
      "books",
      "book",
      "books & reference",
      "book & reference",
      "books and reference",
    ],
  },


  // =====================================================
  // Fashion & Style
  // =====================================================

  {
    key: "fashion_style",

    names: [
      "fashion & style",
      "fashion and style",
      "style",
      "personal style",
    ],
  },


  // =====================================================
  // Software
  // =====================================================

  {
    key: "software",

    names: [
      "software",
      "computer software",
      "business software",
      "productivity software",
      "security software",
      "educational software",
    ],
  },


  // =====================================================
  // Gift Cards
  // =====================================================

  {
    key: "gift_cards",

    names: [
      "gift cards",
      "gift card",
      "Gift Cards",
      "gift certificates",
      "gift certificates & cards",
    ],
  },

  // =====================================================
// Travel
// =====================================================

{
  key: "travel",
  names: [
    "travel",
    "travel & tourism",
    "travel and tourism",
  ],
},

// =====================================================
// Dating
// =====================================================

{
  key: "romance",

  names: [
    "dating",
    "Romance",
    "dating services",
    "dating apps",
    "relationships",
    "relationship",
  ],
},



];

export const AMAZON_CATEGORY_FALLBACKS = {
  "amazon.co.uk": {
    fashion: "https://www.amazon.co.uk/Best-Sellers-Fashion/zgbs/fashion/",

    beauty: "https://www.amazon.co.uk/Best-Sellers-Beauty/zgbs/beauty/",

    health:
      "https://www.amazon.co.uk/Best-Sellers-Health-Personal-Care/zgbs/drugstore/",
  },

  "amazon.com": {
    fashion: "https://www.amazon.com/Best-Sellers-Fashion/zgbs/fashion/",

    beauty: "https://www.amazon.com/Best-Sellers-Beauty/zgbs/beauty/",

    health:
      "https://www.amazon.com/Best-Sellers-Health-Personal-Care/zgbs/drugstore/",
  },
};
