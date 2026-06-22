const APP_URL_PATTERN = /(localhost|127\.0\.0\.1|0\.0\.0\.0|webpack-internal|\/_next\/)/i;
const SCHEMA_ERROR_PATTERN = /SchemaValidationError/i;

export function classifyBrowserConsoleEntries(entries) {
  const appIssues = [];
  const extensionNoise = [];
  const ignored = [];

  for (const entry of entries) {
    const normalized = normalizeConsoleEntry(entry);
    if (!isRelevantLevel(normalized.level)) {
      ignored.push(normalized);
      continue;
    }
    if (normalized.url.startsWith("chrome-extension://")) {
      extensionNoise.push(normalized);
      continue;
    }
    if (APP_URL_PATTERN.test(normalized.url) || SCHEMA_ERROR_PATTERN.test(normalized.message)) {
      appIssues.push(normalized);
      continue;
    }
    ignored.push(normalized);
  }

  return {
    ok: appIssues.length === 0,
    appIssues,
    extensionNoise,
    ignored,
    summary: {
      appIssues: appIssues.length,
      extensionNoise: extensionNoise.length,
      ignored: ignored.length
    }
  };
}

export function normalizeConsoleEntry(entry) {
  return {
    level: String(entry.level ?? entry.type ?? "unknown"),
    message: String(entry.message ?? entry.text ?? ""),
    url: String(entry.url ?? "")
  };
}

function isRelevantLevel(level) {
  return level === "error" || level === "warn" || level === "warning";
}
