
import { createTikTokSession } from "./services/tiktok/session.js";

(async () => {
  const { browser } = await createTikTokSession();

  console.log("Session created.");

  // browser.close();
})();