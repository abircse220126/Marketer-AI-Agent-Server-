import axios from "axios";

export const fetchTikTokTopAds = async ({
  countryCode = "US",
  period = 30,
  page = 1,
  limit = 20,
  apiHeaders,
  cookieHeader,
  
}) => {
  const url = "https://ads.tiktok.com/creative_radar_api/v1/top_ads/v2/list";

  const params = {
    period,
    page,
    limit,
    order_by: "for_you",
    country_code: countryCode,
  };

  const headers = {
    Accept: "application/json, text/plain, */*",
    "Accept-Language": apiHeaders["accept-language"],
    Referer: apiHeaders.referer,
    "User-Agent": apiHeaders["user-agent"],
    lang: apiHeaders.lang,
    timestamp: apiHeaders.timestamp,
    "user-sign": apiHeaders["user-sign"],
    "anonymous-user-id": apiHeaders["anonymous-user-id"],
  };

  console.log("=================================");
  console.log("TikTok API Request");
  console.log("=================================");

  console.log("URL:", url);
  console.log("Params:", params);

  const response = await axios.get(url, {
    params,
    headers,
    timeout: 30000,
  });

  return response.data;
};


export const fetchAllTikTokTopAds = async ({
  countryCode = "US",
  period = 30,
  limit = 20,
  apiHeaders,
  cookieHeader
}) => {
  let allAds = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    console.log("\n=================================");
    console.log(`Fetching TikTok Top Ads - Page ${page}`);
    console.log("=================================");

    const result = await fetchTikTokTopAds({
      countryCode,
      period,
      page,
      limit,
      apiHeaders,
    });

    if (result?.code !== 0) {
      throw new Error(result?.msg || "TikTok API request failed");
    }

    const materials = result?.data?.materials || [];

    const pagination = result?.data?.pagination || {};

    console.log("TikTok pagination response:");
    console.log({
      page: pagination.page,
      size: pagination.size,
      total_count: pagination.total_count,
      has_more: pagination.has_more,
    });

    console.log(`Materials returned: ${materials.length}`);

    allAds.push(...materials);

    console.log(`Total collected: ${allAds.length}`);

    hasMore = pagination.has_more === true;

    page++;

    if (page > 100) {
      console.log("Pagination safety limit reached.");
      break;
    }
  }

  // Remove duplicate ads
  const uniqueAds = Array.from(
    new Map(allAds.map((ad) => [ad.id, ad])).values(),
  );

  console.log("\n=================================");
  console.log("TikTok scraping completed");
  console.log("=================================");

  console.log("Pages fetched:", page - 1);
  console.log("Ads collected:", allAds.length);
  console.log("Unique ads:", uniqueAds.length);

  return {
    ads: uniqueAds,
    totalAds: uniqueAds.length,
    pagesFetched: page - 1,
  };
};




