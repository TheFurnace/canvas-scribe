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
  json: TFile;
}

export async function createDebugReport(
  app: App,
  logger: DebugLogger,
  pluginVersion: string,
): Promise<DebugReportFiles> {
  await ensureDebugFolder(app);
  const stamp = fileTimestamp(new Date());
  const baseName = `canvas-scribe-${stamp}`;
  const jsonPath = availableReportPath(app, baseName);
  const markdownPath = jsonPath.replace(/\.json$/, ".md");
  const device = collectDeviceDetails(app, pluginVersion);
  logger.record("debug", "report_exported", { jsonFile: jsonPath.split("/").pop() ?? "report.json" });
  const bundle: DebugBundle = {
    format: "canvas-scribe-debug",
    schemaVersion: 1,
    device,
    log: logger.snapshot(),
    privacy: "The recorder does not intentionally collect note text, canvas file names, vault name, or raw pen coordinates. Review before sharing publicly.",
  };
  const json = await app.vault.create(jsonPath, `${JSON.stringify(bundle, null, 2)}\n`);
  const markdown = await app.vault.create(markdownPath, feedbackTemplate(device, json.name));
  return { markdown, json };
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

function feedbackTemplate(device: DeviceDetails, jsonName: string): string {
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
- S Pen type (built-in / Pro / other):
- Obsidian version: ${device.obsidianVersion}
- Canvas Scribe version: ${device.pluginVersion}
- Build: ${device.buildId}
- Diagnostic log: [[${jsonName}]]

## Optional notes

Add screenshots or a short screen recording here. The JSON log intentionally excludes note text, canvas names, vault names, and raw pen coordinates.
`;
}

async function ensureDebugFolder(app: App): Promise<void> {
  const existing = app.vault.getAbstractFileByPath(DEBUG_FOLDER);
  if (!existing) await app.vault.createFolder(DEBUG_FOLDER);
}

function availableReportPath(app: App, baseName: string): string {
  const stem = `${DEBUG_FOLDER}/${baseName}`;
  if (!app.vault.getAbstractFileByPath(`${stem}.json`) && !app.vault.getAbstractFileByPath(`${stem}.md`)) {
    return `${stem}.json`;
  }
  let suffix = 2;
  while (
    app.vault.getAbstractFileByPath(`${stem}-${suffix}.json`) ||
    app.vault.getAbstractFileByPath(`${stem}-${suffix}.md`)
  ) {
    suffix += 1;
  }
  return `${stem}-${suffix}.json`;
}

function fileTimestamp(date: Date): string {
  return date.toISOString().replace(/[:.]/g, "-");
}
