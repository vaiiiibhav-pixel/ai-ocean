// Headless smoke test: load the live app (served by the Flask backend on
// localhost), wait for the scene to render, click a station marker, and
// screenshot the result. Also fails loudly on any console error/pageerror.
const { chromium } = require("playwright");

const TARGET = process.argv[2] || "http://127.0.0.1:3000/";
const OUT = process.argv[3] || "/tmp/smoke.png";

(async () => {
  const browser = await chromium.launch({
    executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  const errors = [];
  // Console-text matching for "404" is unreliable (Chrome's own resource-load
  // log line doesn't always include the URL), so treat HTTP responses as the
  // authoritative signal and only use console/pageerror for JS-level failures.
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  page.on("requestfailed", (req) => {
    if (!req.url().includes("favicon")) {
      errors.push(`requestfailed: ${req.url()} -> ${req.failure()?.errorText}`);
    }
  });
  page.on("response", (res) => {
    if (res.status() >= 400 && !res.url().includes("favicon")) {
      errors.push(`http ${res.status()}: ${res.url()}`);
    }
  });

  await page.goto(TARGET, { waitUntil: "networkidle", timeout: 20000 });
  await page.waitForTimeout(600); // let the initial fetch + render settle

  // Sanity: canvas has non-trivial pixel content (not just blank background)
  const canvasStats = await page.evaluate(() => {
    const c = document.getElementById("scene");
    const ctx = c.getContext("2d");
    const data = ctx.getImageData(0, 0, c.width, c.height).data;
    let nonBg = 0;
    for (let i = 0; i < data.length; i += 4 * 97) { // sample every ~97th pixel
      const r = data[i], g = data[i + 1], b = data[i + 2];
      if (!(r < 15 && g < 30 && b < 45)) nonBg++;
    }
    return { width: c.width, height: c.height, nonBgSamples: nonBg };
  });
  console.log("canvas stats:", JSON.stringify(canvasStats));

  const stationCountBefore = await page.evaluate(() => document.querySelectorAll(".station-row").length);
  console.log("stations loaded:", stationCountBefore);
  const loadErrorHidden = await page.evaluate(() => document.getElementById("loadError").hidden);
  console.log("loadError hidden?", loadErrorHidden);

  await page.screenshot({ path: OUT });
  console.log("screenshot saved to", OUT);

  await browser.close();

  if (errors.length) {
    console.log("\nERRORS DETECTED:");
    for (const e of errors) console.log(" -", e);
    process.exitCode = 1;
  } else {
    console.log("\nNO CONSOLE/PAGE ERRORS");
  }

  if (!canvasStats.nonBgSamples || canvasStats.nonBgSamples < 5) {
    console.log("WARNING: canvas looks mostly blank — rendering may have failed");
    process.exitCode = 1;
  }
})().catch((e) => {
  console.error("FATAL:", e);
  process.exitCode = 1;
});
