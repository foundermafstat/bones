const url = process.env.EDITOR_URL ?? "http://localhost:3000/";

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  console.log(
    JSON.stringify(
      {
        ok: false,
        url,
        missingDependency: "playwright",
        nextStep: "Install or provide Playwright in CI, start the editor dev server, then run pnpm smoke:editor-browser."
      },
      null,
      2
    )
  );
  process.exit(1);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const consoleErrors = [];
const pageErrors = [];
page.on("console", (message) => {
  if (message.type() === "error") {
    consoleErrors.push(message.text());
  }
});
page.on("pageerror", (error) => pageErrors.push(error.message));

const result = {
  ok: false,
  url,
  identity: false,
  nonblank: false,
  noFrameworkOverlay: false,
  scenarios: {},
  graph: false,
  export: false,
  responsive: false,
  consoleErrors,
  pageErrors
};

try {
  await page.goto(url, { waitUntil: "networkidle" });
  result.identity = await page.getByText("Bones").first().isVisible();
  result.noFrameworkOverlay = (await page.locator("[data-nextjs-dialog-overlay]").count()) === 0;
  result.nonblank = (await page.locator("canvas, svg").count()) > 0;

  await page.getByRole("radio", { name: "Preview" }).click();
  for (const scenario of ["idle", "walk", "jump", "fall", "land"]) {
    await page.getByRole("button", { name: scenario, exact: true }).click();
    const bodyText = await page.locator("body").innerText();
    result.scenarios[scenario] = bodyText.includes(`Scenario ${scenario}`) || bodyText.includes(scenario);
  }

  await page.getByRole("radio", { name: "State Machine" }).click();
  result.graph = await page.getByText("State Machine Graph").isVisible();

  await page.getByRole("radio", { name: "Timeline" }).click();
  const key = page.getByRole("button", { name: /Key .* at/ }).first();
  const keyBox = await key.boundingBox();
  if (keyBox) {
    await page.mouse.move(keyBox.x + keyBox.width / 2, keyBox.y + keyBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(keyBox.x + keyBox.width / 2 + 48, keyBox.y + keyBox.height / 2);
    await page.mouse.up();
  }

  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page.getByText("7 files ready").waitFor({ timeout: 5000 });
  const bodyText = await page.locator("body").innerText();
  result.export = bodyText.includes("hero.compiled.json") && bodyText.includes("hero.release-manifest.json") && !bodyText.includes("validation failed");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(250);
  result.responsive = await page.getByText("Bones").first().isVisible();

  result.ok =
    result.identity &&
    result.nonblank &&
    result.noFrameworkOverlay &&
    Object.values(result.scenarios).every(Boolean) &&
    result.graph &&
    result.export &&
    result.responsive &&
    consoleErrors.length === 0 &&
    pageErrors.length === 0;
} finally {
  await browser.close();
}

console.log(JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);
