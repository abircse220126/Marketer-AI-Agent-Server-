// // utils/tiktokDecisionEngine.js

// /**
//  * Convert any value to a safe number.
//  */
// const toNumber = (value, fallback = 0) => {
//   const number = Number(value);

//   return Number.isFinite(number) ? number : fallback;
// };

// /**
//  * Round number safely.
//  */
// const round = (value, decimals = 2) => {
//   const factor = 10 ** decimals;

//   return Math.round(value * factor) / factor;
// };

// /**
//  * Normalize one TikTok ad.
//  */
// export const normalizeTikTokAd = (ad) => {
//   const videoInfo = ad?.video_info || {};

//   const videoUrls = videoInfo?.video_url || {};

//   const videoUrl =
//     videoUrls["1080p"] ||
//     videoUrls["720p"] ||
//     videoUrls["540p"] ||
//     videoUrls["480p"] ||
//     videoUrls["360p"] ||
//     null;

//   return {
//     id: String(ad?.id || ""),

//     title: String(ad?.ad_title || "").trim(),

//     brandName: String(ad?.brand_name || "").trim(),

//     ctr: toNumber(ad?.ctr),

//     likes: toNumber(ad?.like),

//     cost: toNumber(ad?.cost),

//     objective: String(ad?.objective_key || ""),

//     industryKey: String(ad?.industry_key || ""),

//     isSearch: Boolean(ad?.is_search),

//     video: {
//       vid: String(videoInfo?.vid || ""),

//       duration: toNumber(videoInfo?.duration),

//       width: toNumber(videoInfo?.width),

//       height: toNumber(videoInfo?.height),

//       cover: videoInfo?.cover || null,

//       url: videoUrl,
//     },
//   };
// };

// /**
//  * Normalize all ads and remove invalid/duplicate IDs.
//  */
// export const normalizeTikTokAds = (ads = []) => {
//   const normalized = ads
//     .filter(Boolean)
//     .map(normalizeTikTokAd)
//     .filter((ad) => ad.id);

//   const uniqueAds = Array.from(
//     new Map(normalized.map((ad) => [ad.id, ad])).values(),
//   );

//   return uniqueAds;
// };

// /**
//  * Calculate percentile.
//  *
//  * This is dynamic.
//  * No hardcoded performance threshold.
//  */
// const percentile = (values, percentileValue) => {
//   if (!values.length) {
//     return 0;
//   }

//   const sorted = [...values].sort((a, b) => a - b);

//   const index = (percentileValue / 100) * (sorted.length - 1);

//   const lower = Math.floor(index);
//   const upper = Math.ceil(index);

//   if (lower === upper) {
//     return sorted[lower];
//   }

//   const weight = index - lower;

//   return sorted[lower] + (sorted[upper] - sorted[lower]) * weight;
// };

// /**
//  * Calculate dataset statistics dynamically.
//  */
// export const calculateDatasetStats = (ads = []) => {
//   if (!ads.length) {
//     return {
//       totalAds: 0,

//       ctr: {
//         average: 0,
//         median: 0,
//         p75: 0,
//         p90: 0,
//         max: 0,
//       },

//       likes: {
//         average: 0,
//         median: 0,
//         p75: 0,
//         p90: 0,
//         max: 0,
//       },

//       duration: {
//         average: 0,
//         median: 0,
//         p75: 0,
//         max: 0,
//       },
//     };
//   }

//   const ctrValues = ads.map((ad) => ad.ctr);

//   const likeValues = ads.map((ad) => ad.likes);

//   const durationValues = ads.map((ad) => ad.video.duration);

//   const sum = (values) => values.reduce((total, value) => total + value, 0);

//   return {
//     totalAds: ads.length,

//     ctr: {
//       average: round(sum(ctrValues) / ctrValues.length),

//       median: round(percentile(ctrValues, 50)),

//       p75: round(percentile(ctrValues, 75)),

//       p90: round(percentile(ctrValues, 90)),

//       max: round(Math.max(...ctrValues)),
//     },

//     likes: {
//       average: round(sum(likeValues) / likeValues.length),

//       median: round(percentile(likeValues, 50)),

//       p75: round(percentile(likeValues, 75)),

//       p90: round(percentile(likeValues, 90)),

//       max: Math.max(...likeValues),
//     },

//     duration: {
//       average: round(sum(durationValues) / durationValues.length),

//       median: round(percentile(durationValues, 50)),

//       p75: round(percentile(durationValues, 75)),

//       max: round(Math.max(...durationValues)),
//     },
//   };
// };

// /**
//  * Normalize a value between 0 and 1.
//  */
// const normalizeScore = (value, min, max) => {
//   if (max <= min) {
//     return 0.5;
//   }

//   return Math.min(1, Math.max(0, (value - min) / (max - min)));
// };

// /**
//  * Calculate performance score dynamically.
//  *
//  * Important:
//  * This is NOT ROI.
//  * It is only a relative signal inside
//  * the current dataset.
//  */
// const calculateAdPerformance = (ad, stats) => {
//   const ctrScore = normalizeScore(ad.ctr, stats.ctr.median, stats.ctr.p90);

//   const likesScore = normalizeScore(
//     ad.likes,
//     stats.likes.median,
//     stats.likes.p90,
//   );

//   const performanceScore = round(
//     (ctrScore * 0.65 + likesScore * 0.35) * 100,
//     1,
//   );

//   return performanceScore;
// };

// /**
//  * Generate dynamic performance label.
//  *
//  * Thresholds are based on the dataset distribution,
//  * not hardcoded CTR values.
//  */
// const getPerformanceLabel = (score) => {
//   if (score >= 80) {
//     return "Strong Signal";
//   }

//   if (score >= 60) {
//     return "Above Average";
//   }

//   if (score >= 40) {
//     return "Average";
//   }

//   return "Below Average";
// };

// /**
//  * Dynamic video duration bucket.
//  */
// const getDurationBucket = (duration) => {
//   if (duration <= 10) {
//     return "0-10s";
//   }

//   if (duration <= 20) {
//     return "10-20s";
//   }

//   if (duration <= 30) {
//     return "20-30s";
//   }

//   if (duration <= 60) {
//     return "30-60s";
//   }

//   return "60s+";
// };

// /**
//  * Count values dynamically.
//  */
// const countBy = (ads, getter) => {
//   const counts = {};

//   for (const ad of ads) {
//     const value = getter(ad);

//     if (!value) {
//       continue;
//     }

//     counts[value] = (counts[value] || 0) + 1;
//   }

//   return counts;
// };

// /**
//  * Convert object counts into ranked array.
//  */
// const rankCounts = (counts) => {
//   return Object.entries(counts)
//     .sort((a, b) => b[1] - a[1])
//     .map(([value, count]) => ({
//       value,
//       count,
//       percentage: round(
//         (count / Object.values(counts).reduce((a, b) => a + b, 0)) * 100,
//         1,
//       ),
//     }));
// };

// /**
//  * Dynamic industry analysis.
//  */
// const analyzeIndustries = (ads) => {
//   const groups = {};

//   for (const ad of ads) {
//     if (!ad.industryKey) {
//       continue;
//     }

//     if (!groups[ad.industryKey]) {
//       groups[ad.industryKey] = [];
//     }

//     groups[ad.industryKey].push(ad);
//   }

//   return Object.entries(groups)
//     .map(([industryKey, group]) => {
//       const avgCTR = group.reduce((sum, ad) => sum + ad.ctr, 0) / group.length;

//       const avgLikes =
//         group.reduce((sum, ad) => sum + ad.likes, 0) / group.length;

//       return {
//         industryKey,

//         ads: group.length,

//         percentage: round((group.length / ads.length) * 100, 1),

//         averageCTR: round(avgCTR),

//         averageLikes: Math.round(avgLikes),
//       };
//     })
//     .sort((a, b) => b.ads - a.ads);
// };

// /**
//  * Dynamic objective analysis.
//  */
// const analyzeObjectives = (ads) => {
//   return rankCounts(countBy(ads, (ad) => ad.objective));
// };

// /**
//  * Dynamic duration analysis.
//  */
// const analyzeDurations = (ads) => {
//   return rankCounts(countBy(ads, (ad) => getDurationBucket(ad.video.duration)));
// };

// /**
//  * Add analysis to every ad.
//  */
// const analyzeAds = (ads, stats) => {
//   return ads
//     .map((ad) => {
//       const performanceScore = calculateAdPerformance(ad, stats);

//       return {
//         ...ad,

//         decision: {
//           performanceScore,

//           performanceLabel: getPerformanceLabel(performanceScore),

//           ctrVsMedian: round(ad.ctr - stats.ctr.median),

//           likesVsMedian: round(ad.likes - stats.likes.median),

//           durationBucket: getDurationBucket(ad.video.duration),
//         },
//       };
//     })
//     .sort((a, b) => b.decision.performanceScore - a.decision.performanceScore);
// };

// /**
//  * Create final decision-making dataset.
//  */
// export const createTikTokDecisionData = (rawAds = []) => {
//   const ads = normalizeTikTokAds(rawAds);

//   if (!ads.length) {
//     return {
//       summary: {
//         totalAds: 0,
//       },

//       statistics: {},

//       insights: {
//         industries: [],
//         objectives: [],
//         durations: [],
//       },

//       topAds: [],

//       ads: [],
//     };
//   }

//   const stats = calculateDatasetStats(ads);

//   const analyzedAds = analyzeAds(ads, stats);

//   const industries = analyzeIndustries(ads);

//   const objectives = analyzeObjectives(ads);

//   const durations = analyzeDurations(ads);

//   return {
//     summary: {
//       totalAds: ads.length,

//       analyzedAt: new Date().toISOString(),
//     },

//     statistics: stats,

//     insights: {
//       industries,

//       objectives,

//       durations,
//     },

//     topAds: analyzedAds.slice(0, 10),

//     ads: analyzedAds,
//   };
// };

function toNumber(value, fallback = 0) {
  const number = Number(value);

  return Number.isFinite(number) ? number : fallback;
}

function median(values) {
  if (!values.length) return 0;

  const sorted = [...values].sort((a, b) => a - b);

  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }

  return sorted[middle];
}

function percentile(values, percentileValue) {
  if (!values.length) return 0;

  const sorted = [...values].sort((a, b) => a - b);

  const index = (percentileValue / 100) * (sorted.length - 1);

  const lower = Math.floor(index);
  const upper = Math.ceil(index);

  if (lower === upper) {
    return sorted[lower];
  }

  const weight = index - lower;

  return sorted[lower] + (sorted[upper] - sorted[lower]) * weight;
}

function average(values) {
  if (!values.length) return 0;

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function normalizeAd(ad) {
  return {
    id: ad?.id || "",

    title: ad?.ad_title || "",

    brandName: ad?.brand_name || "",

    ctr: toNumber(ad?.ctr),

    likes: toNumber(ad?.like),

    cost: toNumber(ad?.cost),

    industryKey: ad?.industry_key || "",

    objective: ad?.objective_key || "",

    isSearch: Boolean(ad?.is_search),

    video: {
      vid: ad?.video_info?.vid || "",

      duration: toNumber(ad?.video_info?.duration),

      cover: ad?.video_info?.cover || "",

      videoUrl: ad?.video_info?.video_url || {},

      width: toNumber(ad?.video_info?.width),

      height: toNumber(ad?.video_info?.height),
    },
  };
}

function getDurationBucket(duration) {
  if (duration <= 10) return "0-10s";

  if (duration <= 20) return "11-20s";

  if (duration <= 30) return "21-30s";

  if (duration <= 60) return "31-60s";

  return "60s+";
}

function safeRatio(value, baseline) {
  if (!baseline || baseline <= 0) {
    return 0;
  }

  return value / baseline;
}

function calculatePerformanceScore({ ctr, likes, ctrMedian, likesMedian }) {
  const ctrRatio = safeRatio(ctr, ctrMedian);

  const likesRatio = safeRatio(likes, likesMedian);

  /*
   * CTR gets higher weight because it is
   * a more direct performance signal.
   */

  const ctrScore = Math.min(ctrRatio, 3);

  const likesScore = Math.min(likesRatio, 3);

  const score = ctrScore * 0.7 + likesScore * 0.3;

  return Number(score.toFixed(4));
}

function getPerformanceLabel(score) {
  if (score >= 2) {
    return "excellent";
  }

  if (score >= 1.25) {
    return "strong";
  }

  if (score >= 0.8) {
    return "average";
  }

  return "weak";
}

function countBy(items, key) {
  const map = new Map();

  for (const item of items) {
    const value = item?.[key];

    if (!value) continue;

    map.set(value, (map.get(value) || 0) + 1);
  }

  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([value, count]) => ({
      value,
      count,
    }));
}

export function createTikTokDecisionData(rawAds = []) {
  if (!Array.isArray(rawAds)) {
    throw new Error("createTikTokDecisionData expects an array");
  }

  const normalizedAds = rawAds.map(normalizeAd).filter((ad) => ad.id);

  if (!normalizedAds.length) {
    return {
      summary: {
        totalAds: 0,
        analyzedAt: new Date().toISOString(),
      },

      statistics: {
        ctr: {},
        likes: {},
      },

      insights: {
        industries: [],
        objectives: [],
        durations: [],
      },

      topAds: [],

      ads: [],
    };
  }

  const ctrValues = normalizedAds.map((ad) => ad.ctr);

  const likesValues = normalizedAds.map((ad) => ad.likes);

  const ctrMedian = median(ctrValues);

  const likesMedian = median(likesValues);

  const analyzedAds = normalizedAds.map((ad) => {
    const ctrVsMedian = safeRatio(ad.ctr, ctrMedian);

    const likesVsMedian = safeRatio(ad.likes, likesMedian);

    const durationBucket = getDurationBucket(ad.video.duration);

    const performanceScore = calculatePerformanceScore({
      ctr: ad.ctr,
      likes: ad.likes,
      ctrMedian,
      likesMedian,
    });

    return {
      ...ad,

      decision: {
        performanceScore,

        performanceLabel: getPerformanceLabel(performanceScore),

        ctrVsMedian: Number(ctrVsMedian.toFixed(4)),

        likesVsMedian: Number(likesVsMedian.toFixed(4)),

        durationBucket,
      },
    };
  });

  analyzedAds.sort(
    (a, b) => b.decision.performanceScore - a.decision.performanceScore,
  );

  const durationItems = analyzedAds.map((ad) => ({
    durationBucket: ad.decision.durationBucket,
  }));

  return {
    summary: {
      totalAds: analyzedAds.length,

      analyzedAt: new Date().toISOString(),
    },

    statistics: {
      ctr: {
        average: Number(average(ctrValues).toFixed(2)),

        median: Number(ctrMedian.toFixed(2)),

        p75: Number(percentile(ctrValues, 75).toFixed(2)),

        p90: Number(percentile(ctrValues, 90).toFixed(2)),

        max: Math.max(...ctrValues),
      },

      likes: {
        average: Math.round(average(likesValues)),

        median: Math.round(likesMedian),

        p75: Math.round(percentile(likesValues, 75)),

        p90: Math.round(percentile(likesValues, 90)),

        max: Math.max(...likesValues),
      },
    },

    insights: {
      industries: countBy(analyzedAds, "industryKey"),

      objectives: countBy(analyzedAds, "objective"),

      durations: countBy(durationItems, "durationBucket"),
    },

    topAds: analyzedAds.slice(0, 10),

    ads: analyzedAds,
  };
}
