// Captures 10 app screenshots, each tailored to one of the 10 AI concept
// images Codex generated for the Instagram batch. Mocks API responses to force
// distinct app states (busy vs calm, sunny vs windy, conversation, etc.) so
// every shot tells a different visual story.

import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(new URL("../..", import.meta.url).pathname);
const OUT_DIR = path.join(ROOT, "output/instagram/app-screenshots");
const BASE_URL = process.env.W2B_CAPTURE_BASE_URL || "http://127.0.0.1:5173";

const appUrl = (params = {}) => {
  const query = new URLSearchParams({ report_anywhere: "1", ...params });
  return `${BASE_URL}/app/?${query.toString()}`;
};

const nowSec = () => Math.floor(Date.now() / 1000);
const minutesAgo = (m) => new Date(Date.now() - m * 60 * 1000).toISOString();

const weatherSunny = {
  current: { ts: nowSec(), temperatureC: 29, windKmh: 8, windDirectionDeg: 180,
    rainProbability: 4, weatherCode: 0, isDay: true },
  next: [
    { ts: nowSec() + 3600, temperatureC: 30, rainProbability: 3, weatherCode: 0 },
    { ts: nowSec() + 7200, temperatureC: 30, rainProbability: 4, weatherCode: 1 },
  ],
};
const weatherSunset = {
  current: { ts: nowSec(), temperatureC: 25, windKmh: 6, windDirectionDeg: 220,
    rainProbability: 3, weatherCode: 1, isDay: true },
  next: [
    { ts: nowSec() + 3600, temperatureC: 23, rainProbability: 3, weatherCode: 2 },
    { ts: nowSec() + 7200, temperatureC: 22, rainProbability: 5, weatherCode: 2 },
  ],
};
const weatherWindy = {
  current: { ts: nowSec(), temperatureC: 22, windKmh: 38, windDirectionDeg: 270,
    rainProbability: 35, weatherCode: 3, isDay: true },
  next: [
    { ts: nowSec() + 3600, temperatureC: 22, rainProbability: 45, weatherCode: 61 },
    { ts: nowSec() + 7200, temperatureC: 21, rainProbability: 55, weatherCode: 63 },
  ],
};
const weatherHeatwave = {
  current: { ts: nowSec(), temperatureC: 34, windKmh: 4, windDirectionDeg: 90,
    rainProbability: 0, weatherCode: 0, isDay: true },
  next: [
    { ts: nowSec() + 3600, temperatureC: 35, rainProbability: 0, weatherCode: 0 },
    { ts: nowSec() + 7200, temperatureC: 33, rainProbability: 1, weatherCode: 0 },
  ],
};
const weatherDawn = {
  current: { ts: nowSec(), temperatureC: 21, windKmh: 5, windDirectionDeg: 130,
    rainProbability: 2, weatherCode: 0, isDay: true },
  next: [
    { ts: nowSec() + 3600, temperatureC: 23, rainProbability: 2, weatherCode: 0 },
    { ts: nowSec() + 7200, temperatureC: 25, rainProbability: 4, weatherCode: 0 },
  ],
};

const buildWeather = (preset) => ({
  ok: true,
  fetchedAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  timezone: "Europe/Rome",
  current: preset.current,
  nextHours: preset.next,
});

const reportsBusy = {
  ok: true,
  reports: [
    { id: "r-busy-1", beachId: "BR-RN-001", level: 3, createdAt: minutesAgo(6),
      note: "Spiaggia praticamente piena" },
    { id: "r-busy-2", beachId: "BR-RN-002", level: 3, createdAt: minutesAgo(11),
      note: "Coda al lido, parcheggi pieni" },
    { id: "r-busy-3", beachId: "BR-RN-003", level: 2, createdAt: minutesAgo(18) },
    { id: "r-busy-4", beachId: "BR-RN-004", level: 3, createdAt: minutesAgo(22) },
    { id: "r-busy-5", beachId: "BR-RN-005", level: 2, createdAt: minutesAgo(34) },
  ],
};
const reportsCalm = {
  ok: true,
  reports: [
    { id: "r-calm-1", beachId: "BR-RN-007", level: 0, createdAt: minutesAgo(8),
      note: "Praticamente vuota, mare calmo" },
    { id: "r-calm-2", beachId: "BR-RN-006", level: 0, createdAt: minutesAgo(15) },
    { id: "r-calm-3", beachId: "BR-RN-008", level: 1, createdAt: minutesAgo(24) },
  ],
};
const reportsForBeach = (beachId, level, note) => ({
  ok: true,
  reports: [
    { id: `r-${beachId}-1`, beachId, level, createdAt: minutesAgo(7), note },
    { id: `r-${beachId}-2`, beachId, level, createdAt: minutesAgo(19) },
  ],
});

const mockApis = async (page, { weather, reports, profile = null } = {}) => {
  await page.route("**/api/weather?*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify(buildWeather(weather)) }));

  await page.route("**/api/reports*", (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({ status: 200, contentType: "application/json",
        body: JSON.stringify(reports) });
    }
    return route.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ ok: true }) });
  });

  await page.route("**/api/beach-profile?*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ ok: true, profile }) }));

  await page.route("**/api/analytics", (route) =>
    route.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ ok: true }) }));

  await page.route("**/api/app-session", (route) =>
    route.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ ok: true,
        user: { id: "marketing-user", email: "demo@where2beach.com" } }) }));
};

const preparePage = async (context, mocks) => {
  const page = await context.newPage();
  await mockApis(page, mocks);
  await page.addStyleTag({ content: `
    * { caret-color: transparent !important; }
    .leaflet-control-attribution { opacity: .72 !important; }
  ` }).catch(() => undefined);
  return page;
};

const settle = async (page, extra = 900) => {
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);
  await page.waitForTimeout(extra);
};

const shoot = async (page, name) => {
  await settle(page);
  await page.screenshot({ path: path.join(OUT_DIR, `${name}.png`), fullPage: false });
};

await fs.mkdir(OUT_DIR, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
});

await context.addCookies([
  { name: "br_app_access", value: "1", domain: "127.0.0.1", path: "/" },
  { name: "br_app_access", value: "1", domain: "localhost", path: "/" },
]);

const scenarios = [
  // 01. Parcheggi/spiaggia pieni → mappa con marker saturi
  { name: "ai-01-parking-pieno",
    mocks: { weather: weatherSunny, reports: reportsBusy },
    open: async (page) => {
      await page.goto(appUrl());
      await page.getByTestId("map-container").waitFor({ state: "visible" });
    } },

  // 02. Pianificazione (mappa cartacea) → search con risultato
  { name: "ai-02-mappa-cartacea",
    mocks: { weather: weatherSunny, reports: reportsCalm },
    open: async (page) => {
      await page.goto(appUrl());
      await page.getByTestId("search-input").waitFor({ state: "visible" });
      await page.getByTestId("search-input").fill("Cervia");
      await page.waitForTimeout(700);
    } },

  // 03. Decisione tramonto → beach detail con weather sera
  { name: "ai-03-tramonto-decisione",
    mocks: { weather: weatherSunset,
      reports: reportsForBeach("BR-RN-001", 1, "Tramonto, gente che lascia") },
    open: async (page) => {
      await page.goto(appUrl({ beach: "BR-RN-001" }));
      await page.getByTestId("lido-modal").waitFor({ state: "visible" });
    } },

  // 04. Community/contributo → rewards
  { name: "ai-04-pulizia-community",
    mocks: { weather: weatherSunny, reports: reportsCalm },
    open: async (page) => {
      await page.goto(appUrl({ mock_auth: "1" }));
      await page.getByTestId("bottom-nav-rewards").click();
      await page.waitForTimeout(800);
    } },

  // 05. Fila lido / sovraffollamento → beach detail con afa estiva
  { name: "ai-05-fila-lido",
    mocks: { weather: weatherHeatwave,
      reports: reportsForBeach("BR-RN-002", 3, "Affollatissima, fila ingresso lido") },
    open: async (page) => {
      await page.goto(appUrl({ beach: "BR-RN-002" }));
      await page.getByTestId("lido-modal").waitFor({ state: "visible" });
    } },

  // 06. Famiglia in uscita → bottom sheet espanso con lista spiagge vicine
  { name: "ai-06-famiglia-uscita",
    mocks: { weather: weatherSunny, reports: reportsCalm },
    open: async (page) => {
      await page.goto(appUrl());
      await page.getByTestId("map-container").waitFor({ state: "visible" });
      await page.waitForTimeout(800);
      const toggle = page.getByTestId("bottom-sheet-header-toggle");
      if (await toggle.count()) {
        await toggle.first().click().catch(() => undefined);
        await page.waitForTimeout(700);
      }
    } },

  // 07. Baia perfetta raggiunta → beach detail livello 0
  { name: "ai-07-baia-perfetta",
    mocks: { weather: weatherSunny,
      reports: reportsForBeach("BR-RN-007", 0, "Praticamente deserta, acqua cristallina") },
    open: async (page) => {
      await page.goto(appUrl({ beach: "BR-RN-007" }));
      await page.getByTestId("lido-modal").waitFor({ state: "visible" });
    } },

  // 08. Bandiere/sicurezza → weather con vento forte
  { name: "ai-08-bandiera-vento",
    mocks: { weather: weatherWindy,
      reports: reportsForBeach("BR-RN-003", 1, "Vento forte, mare mosso") },
    open: async (page) => {
      await page.goto(appUrl({ beach: "BR-RN-003" }));
      await page.getByTestId("lido-modal").waitFor({ state: "visible" });
      await page.getByTestId("lido-weather").waitFor({ state: "visible" })
        .catch(() => undefined);
    } },

  // 09. Alba/momento ideale → beach detail + weather mattina, livello 0
  { name: "ai-09-alba-calma",
    mocks: { weather: weatherDawn,
      reports: reportsForBeach("BR-RN-005", 0, "Alba, ombrelloni vuoti") },
    open: async (page) => {
      await page.goto(appUrl({ beach: "BR-RN-005" }));
      await page.getByTestId("lido-modal").waitFor({ state: "visible" });
    } },

  // 10. Treno/in viaggio → ONDA chatbot aperto (auth mock per saltare paywall)
  { name: "ai-10-onda-chat",
    mocks: { weather: weatherSunny, reports: reportsCalm },
    open: async (page) => {
      await page.goto(appUrl({ mock_auth: "1" }));
      await page.getByTestId("bottom-nav-chatbot").click();
      await page.waitForTimeout(1200);
    } },
];

const results = [];
try {
  for (const scenario of scenarios) {
    const page = await preparePage(context, scenario.mocks);
    try {
      await scenario.open(page);
      await shoot(page, scenario.name);
      results.push({ name: scenario.name, ok: true });
    } catch (err) {
      results.push({ name: scenario.name, ok: false, error: err.message });
    } finally {
      await page.close();
    }
  }
} finally {
  await browser.close();
}

console.log(`Saved ${results.filter((r) => r.ok).length}/${results.length} screenshots to ${OUT_DIR}`);
for (const r of results) {
  if (!r.ok) console.error(`  FAIL ${r.name}: ${r.error}`);
}
