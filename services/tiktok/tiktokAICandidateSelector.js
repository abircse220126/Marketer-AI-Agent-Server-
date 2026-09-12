
export const selectTikTokAICandidates = (decisionData, options = {}) => {
  const {
    topPerformance = 5,
    topCTR = 3,
    topLikes = 2,
    maxCandidates = 12,
  } = options;

  const ads = Array.isArray(decisionData?.ads) ? decisionData.ads : [];

  if (!ads.length) {
    return [];
  }

  const selected = new Map();

  const addAds = (adsToAdd = []) => {
    for (const ad of adsToAdd) {
      if (!ad?.id) continue;

      if (!selected.has(ad.id)) {
        selected.set(ad.id, ad);
      }

      if (selected.size >= maxCandidates) {
        break;
      }
    }
  };

  /**
   * 1. Top overall performance
   */
  const performanceAds = [...ads]
    .sort(
      (a, b) =>
        Number(b?.decision?.performanceScore || 0) -
        Number(a?.decision?.performanceScore || 0),
    )
    .slice(0, topPerformance);

  addAds(performanceAds);

  /**
   * 2. Highest CTR
   */
  const ctrAds = [...ads]
    .sort((a, b) => Number(b?.ctr || 0) - Number(a?.ctr || 0))
    .slice(0, topCTR);

  addAds(ctrAds);

  /**
   * 3. Highest likes
   */
  const likesAds = [...ads]
    .sort((a, b) => Number(b?.likes || 0) - Number(a?.likes || 0))
    .slice(0, topLikes);

  addAds(likesAds);

  /**
   * 4. Add industry diversity
   *
   * This helps AI understand different
   * product/market categories.
   */
  const industryMap = new Map();

  for (const ad of ads) {
    const industry = ad?.industryKey || ad?.industry_key;

    if (!industry) continue;

    if (!industryMap.has(industry)) {
      industryMap.set(industry, ad);
    }
  }

  for (const ad of industryMap.values()) {
    addAds([ad]);

    if (selected.size >= maxCandidates) {
      break;
    }
  }

  /**
   * Final result
   */
  return Array.from(selected.values()).slice(0, maxCandidates);
};

/**
 * Convert TikTok ad objects into a compact
 * structure suitable for AI.
 *
 * This prevents huge video URLs and unnecessary
 * TikTok metadata from being sent to Gemini.
 */
export const prepareAdsForAI = (ads = []) => {
  return ads.map((ad) => ({
    id: ad?.id || null,

    title: ad?.title || ad?.ad_title || "",

    brandName: ad?.brandName || ad?.brand_name || "",

    ctr: Number(ad?.ctr || 0),

    likes: Number(ad?.likes ?? ad?.like ?? 0),

    objective: ad?.objective || ad?.objectiveKey || ad?.objective_key || "",

    industryKey: ad?.industryKey || ad?.industry_key || "",

    duration: Number(
      ad?.duration ?? ad?.video?.duration ?? ad?.video_info?.duration ?? 0,
    ),

    performanceScore: Number(ad?.decision?.performanceScore || 0),

    performanceLabel: ad?.decision?.performanceLabel || "",

    ctrVsMedian: Number(ad?.decision?.ctrVsMedian || 0),

    likesVsMedian: Number(ad?.decision?.likesVsMedian || 0),

    durationBucket: ad?.decision?.durationBucket || "",
  }));
};
