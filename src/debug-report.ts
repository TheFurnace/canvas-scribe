import { Platform, type App, type TFile } from "obsidian";

import { BUILD_ID } from "./build-info";
import type { DebugLogger, DebugSnapshot } from "./debug-logger";

const DEBUG_FOLDER = "Canvas Scribe Debug";

interface DeviceDetails {
  buildId: string;
  pluginVersion: string;
  obsidianVersion: string;
  platform: string;
  userAgent: string;
  language: string;
  viewport: string;
  devicePixelRatio: number;
  maxTouchPoints: number;
}

interface DebugBundle {
  format: "canvas-scribe-debug";
  schemaVersion: 1;
  device: DeviceDetails;
  log: DebugSnapshot;
  privacy: string;
}

export interface DebugReportFiles {
  markdown: TFile;
  log: TFile;
}

export async function createDebugReport(
  app: App,
  logger: DebugLogger,
  pluginVersion: string,
): Promise<DebugReportFiles> {
  await ensureDebugFolder(app);
  const stamp = fileTimestamp(new Date());
  const baseName = `canvas-scribe-${stamp}`;
  const reportStem = availableReportStem(app, baseName);
  const markdownPath = `${reportStem}.md`;
  const logPath = `${reportStem}-log.md`;
  const device = collectDeviceDetails(app, pluginVersion);
  logger.record("debug", "report_exported", { logFile: logPath.split("/").pop() ?? "report-log.md" });
  const bundle: DebugBundle = {
    format: "canvas-scribe-debug",
    schemaVersion: 1,
    device,
    log: logger.snapshot(),
    privacy: "The recorder does not intentionally collect note text, canvas file names, vault name, or raw stylus coordinates. Review before sharing publicly.",
  };
  const log = await app.vault.create(logPath, logTemplate(bundle));
  const markdown = await app.vault.create(markdownPath, feedbackTemplate(device, log.name));
  return { markdown, log };
}

function collectDeviceDetails(app: App, pluginVersion: string): DeviceDetails {
  const appVersion = (app as App & { version?: string }).version ?? "unknown";
  const viewport = `${window.innerWidth}x${window.innerHeight}`;
  return {
    buildId: BUILD_ID,
    pluginVersion,
    obsidianVersion: appVersion,
    platform: platformName(),
    userAgent: navigator.userAgent,
    language: navigator.language,
    viewport,
    devicePixelRatio: window.devicePixelRatio,
    maxTouchPoints: navigator.maxTouchPoints,
  };
}

function platformName(): string {
  if (Platform.isAndroidApp) return "android";
  if (Platform.isIosApp) return "ios";
  if (Platform.isWin) return "windows";
  if (Platform.isMacOS) return "macos";
  if (Platform.isLinux) return "linux";
  return Platform.isMobile ? "mobile-unknown" : "desktop-unknown";
}

function feedbackTemplate(device: DeviceDetails, logName: string): string {
  return `# Canvas Scribe test report

## What happened?

Describe the problem or behavior you noticed.

## What did you expect?

Describe the result you wanted.

## Steps to reproduce

1.
2.
3.

## Frequency

- [ ] Once
- [ ] Sometimes
- [ ] Every time

## Test context

- Galaxy model:
- Android version:
- One UI version:
- Android System WebView version:
- Keyboard / IME and version:
- Samsung **S Pen to text** enabled: yes / no
- Stylus model (built-in S Pen / S Pen Pro / other):
- Obsidian version: ${device.obsidianVersion}
- Canvas Scribe version: ${device.pluginVersion}
- Build: ${device.buildId}
- Diagnostic log: [[${logName}]]

## Ink latency comparison (if tested)

- Surface: Canvas / handwritten note
- Display refresh setting and battery saver:
- Samsung Notes version and matching pen/zoom:
- Prediction OFF: fast-line gap, corners, stop while touching:
- Prediction 16 ms: fast-line gap, corners, stop while touching:
- Prediction 24 ms: fast-line gap, corners, stop while touching:
- Prediction 32 ms: fast-line gap, corners, stop while touching:
- Delegated ink OFF / ON (opaque ballpoint, fountain or brush): fast-line gap, joins, corners, stops and pen lift:
- Bright diagnostics: cyan dot visible? Yellow extension visible with prediction? Magenta trail visible with delegation?
- Any overshoot or visible correction at pen lift:

Use **Toggle ink latency recording**, draw a baseline, then **Debug: Cycle prediction horizon OFF / 16 / 24 / 32 ms** and repeat at each mode. Confirm the mode in the notice. Prediction defaults to the recommended 16 ms. Toggle ink prediction saves ON (16 ms) or OFF; debug horizons are session-only. Restart restores that preference and turns recording OFF. Changes apply to new strokes. The log includes per-stroke timing, used prediction horizon/distance, cap frequency and estimated lead remaining at render. These measure JavaScript work and preview endpoints before smoothing/paint, not physical pen-to-display latency. No stroke coordinates are included.

## Optional notes

For delegated ink, use **Toggle delegated ink trail (experimental)** to compare OFF and ON with the same opaque pen, speed and zoom. It disables application prediction; cycling prediction disables delegated ink. Delegation resets OFF on restart, restoring your saved 16 ms/OFF prediction preference. Delegated stroke entries report unavailable/unsupported style, request failures, successful update counts and stale/untrusted input skips. Successful calls do not prove that WebView displayed a trail or reduced physical latency. Pencil, highlighter and translucent pens use ordinary SVG ink in this test.

Use **Toggle bright ink diagnostics (cyan / yellow / magenta)** for a visibility test. Cyan marks the latest accepted actual point; yellow marks the unsmoothed predicted endpoint and extension. In delegated mode only the browser is asked to draw a magenta 16 CSS-pixel trail: the plugin never draws a magenta replacement. Cyan alone does not prove delegation. Markers are temporary, reset OFF on restart, and never enter saved ink. This deliberately oversized display is for visibility, not latency measurement.

Add screenshots or a short screen recording here. The diagnostic log intentionally excludes note text, canvas names, vault names, and raw stylus coordinates.
`;
}

function logTemplate(bundle: DebugBundle): string {
  return `# Canvas Scribe diagnostic log

This Markdown wrapper keeps the structured log compatible with vault sync. The JSON block intentionally excludes note text, canvas names, vault names, and raw stylus coordinates.

\`\`\`json
${JSON.stringify(bundle, null, 2)}
\`\`\`
`;
}

async function ensureDebugFolder(app: App): Promise<void> {
  const existing = app.vault.getAbstractFileByPath(DEBUG_FOLDER);
  if (!existing) await app.vault.createFolder(DEBUG_FOLDER);
}

function availableReportStem(app: App, baseName: string): string {
  const stem = `${DEBUG_FOLDER}/${baseName}`;
  if (!app.vault.getAbstractFileByPath(`${stem}.md`) && !app.vault.getAbstractFileByPath(`${stem}-log.md`)) {
    return stem;
  }
  let suffix = 2;
  while (
    app.vault.getAbstractFileByPath(`${stem}-${suffix}.md`) ||
    app.vault.getAbstractFileByPath(`${stem}-${suffix}-log.md`)
  ) {
    suffix += 1;
  }
  return `${stem}-${suffix}`;
}

function fileTimestamp(date: Date): string {
  return date.toISOString().replace(/[:.]/g, "-");
}
