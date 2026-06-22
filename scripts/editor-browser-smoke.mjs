import { classifyBrowserConsoleEntries } from "./editor-console-classifier.mjs";

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
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const consoleEntries = [];
const pageErrors = [];
page.on("console", (message) => {
  const type = message.type();
  if (type === "error" || type === "warning" || type === "warn") {
    consoleEntries.push({
      level: type === "warning" ? "warn" : type,
      message: message.text(),
      url: message.location().url
    });
  }
});
page.on("pageerror", (error) => pageErrors.push(error.message));
const consoleSummary = classifyBrowserConsoleEntries(consoleEntries);

const result = {
  ok: false,
  url,
  identity: false,
  nonblank: false,
  noFrameworkOverlay: false,
  scenarios: {},
  graph: false,
  export: false,
  layout: {
    desktopPanelsVisible: false,
    timelineExpandedCanvasStable: false,
    timelineCollapsedControlsClear: false,
    inspectorScroll: false,
    toolbarControlsClear: false
  },
  responsive: false,
  console: consoleSummary,
  consoleErrors: consoleSummary.appIssues,
  pageErrors
};

try {
  await page.goto(url, { waitUntil: "networkidle" });
  result.identity = await page.getByText("Bones").first().isVisible();
  result.noFrameworkOverlay = (await page.locator("[data-nextjs-dialog-overlay]").count()) === 0;
  result.nonblank = (await page.locator("canvas, svg").count()) > 0;
  result.layout.desktopPanelsVisible = await allVisibleBoxes([
    page.getByRole("heading", { name: "Hierarchy" }),
    page.getByRole("heading", { name: "Inspector" }),
    page.getByLabel("Timeline and dopesheet"),
    page.getByLabel("PixiJS canvas viewport")
  ]);
  result.layout.toolbarControlsClear = (await countOverlaps(page.locator("header button, header [role='radio']"))) === 0;

  await page.getByRole("radio", { name: "Preview" }).click();
  for (const scenario of ["idle", "walk", "jump", "fall", "land"]) {
    await page.getByRole("button", { name: scenario, exact: true }).click();
    const bodyText = await page.locator("body").innerText();
    result.scenarios[scenario] = bodyText.includes(`Scenario ${scenario}`) || bodyText.includes(scenario);
  }

  await page.getByRole("radio", { name: "State Machine" }).click();
  result.graph = await page.getByText("State Machine Graph").isVisible();

  await page.getByRole("radio", { name: "Timeline" }).click();
  await dragSeparator(page.getByRole("separator", { name: "Resize timeline panel" }), page, 0, -120);
  await page.waitForTimeout(200);
  const expandedCanvasBox = await page.locator("canvas").first().boundingBox();
  result.layout.timelineExpandedCanvasStable = Boolean(expandedCanvasBox && expandedCanvasBox.width >= 320 && expandedCanvasBox.height >= 240);
  await dragSeparator(page.getByRole("separator", { name: "Resize timeline panel" }), page, 0, 220);
  await page.waitForTimeout(200);
  result.layout.timelineCollapsedControlsClear = (await countOverlaps(page.locator("[aria-label='Timeline and dopesheet'] button, [aria-label='Timeline and dopesheet'] input, [aria-label='Timeline and dopesheet'] [role='combobox'"))) === 0;
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
  await page.getByText("hero.release-manifest.json").scrollIntoViewIfNeeded();
  result.layout.inspectorScroll = await page.getByText("hero.release-manifest.json").isVisible();
  const bodyText = await page.locator("body").innerText();
  result.export = bodyText.includes("hero.compiled.json") && bodyText.includes("hero.release-manifest.json") && !bodyText.includes("validation failed");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(250);
  result.responsive = await page.getByText("Bones").first().isVisible();
  const finalConsoleSummary = classifyBrowserConsoleEntries(consoleEntries);
  result.console = finalConsoleSummary;
  result.consoleErrors = finalConsoleSummary.appIssues;

  result.ok =
    result.identity &&
    result.nonblank &&
    result.noFrameworkOverlay &&
    Object.values(result.scenarios).every(Boolean) &&
    result.graph &&
    result.export &&
    Object.values(result.layout).every(Boolean) &&
    result.responsive &&
    finalConsoleSummary.ok &&
    pageErrors.length === 0;
} finally {
  await browser.close();
}

console.log(JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);

async function allVisibleBoxes(locators) {
  const boxes = await Promise.all(locators.map(async (locator) => locator.first().boundingBox().catch(() => null)));
  return boxes.every((box) => Boolean(box && box.width > 0 && box.height > 0));
}

async function dragSeparator(separator, page, dx, dy) {
  const box = await separator.boundingBox();
  if (!box) {
    return;
  }
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy);
  await page.mouse.up();
}

async function countOverlaps(locator) {
  return locator.evaluateAll((elements) => {
    const boxes = elements
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 ? { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom } : null;
      })
      .filter(Boolean);
    let overlaps = 0;
    for (let leftIndex = 0; leftIndex < boxes.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < boxes.length; rightIndex += 1) {
        const left = boxes[leftIndex];
        const right = boxes[rightIndex];
        if (left.left < right.right && left.right > right.left && left.top < right.bottom && left.bottom > right.top) {
          overlaps += 1;
        }
      }
    }
    return overlaps;
  });
}
