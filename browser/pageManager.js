// const browserManager = require("./browserManager");

// const BROWSER_CONFIG = require("../config/browserConfig");

// const USER_AGENT =
//   "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36";

// async function createPage() {
//   const browser = await browserManager();

//   const page = await browser.newPage();

//   /*
//   =====================================
//   User Agent
//   =====================================
//   */

//   await page.setUserAgent(USER_AGENT);

//   /*
//   =====================================
//   Viewport
//   =====================================
//   */

//   await page.setViewport(BROWSER_CONFIG.viewport);

//   /*
//   =====================================
//   Timeout
//   =====================================
//   */

//   page.setDefaultNavigationTimeout(BROWSER_CONFIG.navigationTimeout);

//   page.setDefaultTimeout(BROWSER_CONFIG.selectorTimeout);

//   /*
//   =====================================
//   Extra Headers
//   =====================================
//   */

//   await page.setExtraHTTPHeaders({
//     "accept-language": BROWSER_CONFIG.acceptLanguage,

//     "cache-control": "no-cache",

//     pragma: "no-cache",
//   });

//   /*
//   =====================================
//   Timezone
//   =====================================
//   */

//   try {
//     await page.emulateTimezone(BROWSER_CONFIG.timezone);
//   } catch (err) {}

//   /*
//   =====================================
//   Bypass Basic Detection
//   =====================================
//   */

//   await page.evaluateOnNewDocument(() => {
//     Object.defineProperty(navigator, "webdriver", {
//       get: () => false,
//     });

//     Object.defineProperty(navigator, "languages", {
//       get: () => ["en-US", "en"],
//     });

//     Object.defineProperty(navigator, "platform", {
//       get: () => "Win32",
//     });

//     Object.defineProperty(navigator, "hardwareConcurrency", {
//       get: () => 8,
//     });

//     Object.defineProperty(navigator, "deviceMemory", {
//       get: () => 8,
//     });

//     Object.defineProperty(navigator, "plugins", {
//       get: () => [1, 2, 3, 4, 5],
//     });

//     window.chrome = {
//       runtime: {},
//     };
//   });

//   /*
//   =====================================
//   Block Heavy Resources
//   =====================================
//   */

//   await page.setRequestInterception(true);

//   page.on("request", (request) => {
//     const type = request.resourceType();

//     if (type === "image" || type === "media" || type === "font") {
//       return request.abort();
//     }

//     request.continue();
//   });

//   return page;
// }

// async function closePage(page) {
//   if (!page) return;

//   try {
//     await page.close({
//       runBeforeUnload: false,
//     });
//   } catch (err) {
//     console.error("Page Close Error:", err.message);
//   }
// }

// module.exports = {
//   createPage,

//   closePage,
// };
