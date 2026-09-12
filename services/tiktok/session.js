// import puppeteer from "puppeteer";

// export async function createTikTokSession() {
//   const browser = await puppeteer.launch({
//     headless: false, // প্রথমে false রাখো debugging এর জন্য
//     defaultViewport: {
//       width: 1400,
//       height: 900,
//     },
//     args: [
//       "--no-sandbox",
//       "--disable-setuid-sandbox",
//       "--disable-dev-shm-usage",
//     ],
//   });

//   const page = await browser.newPage();

//   let apiHeaders = null;

//   page.on("request", (request) => {
//     const url = request.url();

//     if (url.includes("/creative_radar_api/v1/top_ads/v2/list")) {
//       console.log("\n==============================");
//       console.log("TikTok API Request Found");
//       console.log("==============================");

//       apiHeaders = request.headers();

//       console.log(apiHeaders);
//     }
//   });

//   const cookies = await page.cookies();

//   console.log("TikTok Cookies:", cookies);

//   await page.setUserAgent(
//     "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
//   );

//   await page.setExtraHTTPHeaders({
//     "accept-language": "en-US,en;q=0.9",
//   });

//   console.log("Opening TikTok Creative Center...");

//   await page.goto(
//     "https://ads.tiktok.com/business/creativecenter/inspiration/topads/pc/en?region=US&period=30",
//     {
//       waitUntil: "networkidle2",
//       timeout: 60000,
//     },
//   );

//   // await page.waitForTimeout(5000);
//   await new Promise((resolve) => setTimeout(resolve, 10000));

//   console.log("TikTok page loaded.");

//   return {
//     browser,
//     page,
//     apiHeaders,
//     cookies,
//   };
// }

import puppeteer from "puppeteer";

export async function createTikTokSession() {
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: {
      width: 1400,
      height: 900,
    },
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
    ],
  });

  const page = await browser.newPage();

  let apiHeaders = null;

  page.on("request", (request) => {
    const url = request.url();

    if (url.includes("/creative_radar_api/v1/top_ads/v2/list")) {
      console.log("\n==============================");
      console.log("TikTok API Request Found");
      console.log("==============================");

      apiHeaders = request.headers();

      console.log("API Headers:");
      console.dir(apiHeaders, { depth: null });
    }
  });

  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
  );

  await page.setExtraHTTPHeaders({
    "accept-language": "en-US,en;q=0.9",
  });

  console.log("Opening TikTok Creative Center...");

  await page.goto(
    "https://ads.tiktok.com/business/creativecenter/inspiration/topads/pc/en?region=US&period=30",
    {
      waitUntil: "networkidle2",
      timeout: 60000,
    },
  );

  await new Promise((resolve) => setTimeout(resolve, 10000));

  console.log("TikTok page loaded.");

  // IMPORTANT:
  // TikTok page load হওয়ার পরে cookies নিতে হবে
  const cookies = await page.cookies();

  console.log("TikTok Cookies:");
  console.dir(cookies, { depth: null });

  // Cookie string তৈরি
  const cookieHeader = cookies
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join("; ");

  console.log("Cookie Header:");
  console.log(cookieHeader);

  return {
    browser,
    page,
    apiHeaders,
    cookies,
    cookieHeader,
  };
}
