// =====================================================
// Calculate Category Average Rating
// =====================================================

const calculateAverageRating = (products) => {
  // Only products with valid rating

  const ratedProducts = products.filter(
    (product) =>
      typeof product.rating === "number" &&
      product.rating >= 0 &&
      product.rating <= 5,
  );

  // No rating found

  if (ratedProducts.length === 0) {
    return 0;
  }

  // Calculate total rating

  const totalRating = ratedProducts.reduce(
    (sum, product) => sum + product.rating,

    0,
  );

  // Calculate average

  const average = totalRating / ratedProducts.length;

  // Round to 2 decimal places

  return Number(average.toFixed(2));
};

// =====================================================
// Get Top 3 Products
// =====================================================

const getTopProducts = (products, limit = 3) => {
  return (
    products

      // Only valid products

      .filter((product) => product.name && typeof product.rating === "number")

      // Sort by rating

      .sort((a, b) => b.rating - a.rating)

      // Take top products

      .slice(0, limit)

      // Return clean data

      .map((product) => ({
        // rank: product.rank,

        // asin: product.asin,

        name: product.name,

        rating: product.rating,

        // reviews: product.reviews,

        // price: product.price,

        // url: product.url,

        // image: product.image,
      }))
  );
};

// =====================================================
// Category Engine
// =====================================================

export const buildCategoryEngine = (products) => {
  // ===================================================
  // 1. Group Products by Category
  // ===================================================

  const categoryMap = new Map();

  for (const product of products) {
    if (!product.category) {
      continue;
    }

    if (!categoryMap.has(product.category)) {
      categoryMap.set(product.category, {

        key: product.category,

        name: product.categoryName,

        url: product.categoryUrl,

        products: [],
      });
    }

    categoryMap.get(product.category).products.push(product);
  }

  // ===================================================
  // 2. Calculate Category Statistics
  // ===================================================

  const categoryResults = [];

  for (const category of categoryMap.values()) {
    // -----------------------------------------------
    // Average Rating
    // -----------------------------------------------

    const averageRating = calculateAverageRating(category.products);

    // -----------------------------------------------
    // Top 3 Products
    // -----------------------------------------------

    const topProducts = getTopProducts(category.products, 3);

    // -----------------------------------------------
    // Save Category Result
    // -----------------------------------------------

    categoryResults.push({
      category: category.key,

      totalProducts: category.products.length,

      averageRating,

      topProducts,
    });
  }

  // ===================================================
  // 3. Sort Categories by Average Rating
  // ===================================================

  categoryResults.sort((a, b) => b.averageRating - a.averageRating);

  // ===================================================
  // 4. Get Top 4 Categories
  // ===================================================

  const topCategories = categoryResults.slice(0, 4);

  // ===================================================
  // 5. Return Final Result
  // ===================================================

  return {
    totalCategories: categoryResults.length,

    topCategories,

    // allCategories: categoryResults,
  };
};
