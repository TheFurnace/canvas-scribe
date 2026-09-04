import { extractFile } from "@electron/asar";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..");
const outputPath = join(repositoryRoot, ".storybook", "generated", "obsidian-app.css");
const args = process.argv.slice(2);
const optional = args.includes("--optional");

function argumentValue(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function existingFile(candidate) {
  if (!candidate || !existsSync(candidate)) return undefined;
  return statSync(candidate).isFile() ? resolve(candidate) : undefined;
}

function newestVersionedAsar(directory) {
  if (!directory || !existsSync(directory)) return undefined;
  const candidates = readdirSync(directory)
    .filter((name) => /^obsidian-[\d.]+\.asar$/u.test(name))
    .map((name) => join(directory, name))
    .sort(compareAsarVersions);
  return candidates[0];
}

function compareAsarVersions(left, right) {
  const version = (file) => basename(file).match(/^obsidian-([\d.]+)\.asar$/u)?.[1].split(".").map(Number) ?? [];
  const leftVersion = version(left);
  const rightVersion = version(right);
  for (let index = 0; index < Math.max(leftVersion.length, rightVersion.length); index += 1) {
    const difference = (rightVersion[index] ?? 0) - (leftVersion[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return statSync(right).mtimeMs - statSync(left).mtimeMs;
}

function discoverObsidianStyles() {
  const explicit = argumentValue("--path") ?? process.env.CANVAS_SCRIBE_OBSIDIAN_STYLES;
  if (explicit) return existingFile(explicit);

  const home = homedir();
  const dataDirectories = [
    process.env.APPDATA && join(process.env.APPDATA, "obsidian"),
    join(home, "Library", "Application Support", "obsidian"),
    process.env.XDG_CONFIG_HOME && join(process.env.XDG_CONFIG_HOME, "obsidian"),
    join(home, ".config", "obsidian"),
  ];
  for (const directory of dataDirectories) {
    const archive = newestVersionedAsar(directory);
    if (archive) return archive;
  }

  const directCandidates = [
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, "Programs", "Obsidian", "resources", "obsidian.asar"),
    "/Applications/Obsidian.app/Contents/Resources/obsidian.asar",
    join(home, "Applications", "Obsidian.app", "Contents", "Resources", "obsidian.asar"),
    "/usr/lib/obsidian/resources/obsidian.asar",
    "/opt/Obsidian/resources/obsidian.asar",
  ];
  for (const candidate of directCandidates) {
    const file = existingFile(candidate);
    if (file) return file;
  }
  return undefined;
}

function syncStyles(sourcePath) {
  mkdirSync(dirname(outputPath), { recursive: true });
  const directCss = extname(sourcePath).toLowerCase() === ".css";
  const stylesheet = directCss ? readFileSync(sourcePath) : extractFile(sourcePath, "app.css");
  writeFileSync(outputPath, stylesheet);

  const assetPaths = [...stylesheet.toString().matchAll(/url\(["']?(public\/(?:fonts|images)\/[^)'"\s]+)["']?\)/gu)]
    .map((match) => match[1])
    .filter((asset, index, all) => all.indexOf(asset) === index);
  let syncedAssetCount = 0;
  for (const assetPath of assetPaths) {
    const targetPath = join(dirname(outputPath), ...assetPath.split("/"));
    mkdirSync(dirname(targetPath), { recursive: true });
    try {
      if (directCss) {
        copyFileSync(join(dirname(sourcePath), ...assetPath.split("/")), targetPath);
      } else {
        writeFileSync(targetPath, extractFile(sourcePath, join(...assetPath.split("/"))));
      }
      syncedAssetCount += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`Could not sync ${assetPath}: ${message}`);
    }
  }
  console.log(`Synced Obsidian styles and ${syncedAssetCount}/${assetPaths.length} assets from ${basename(sourcePath)}.`);
}

try {
  const sourcePath = discoverObsidianStyles();
  if (!sourcePath) {
    throw new Error(
      "No Obsidian app.css or obsidian.asar was found. Pass --path <file> or set CANVAS_SCRIBE_OBSIDIAN_STYLES.",
    );
  }
  syncStyles(sourcePath);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  if (!optional) throw error;
  console.warn(`Obsidian CSS sync skipped: ${message}`);
  console.warn("Storybook will use the lightweight committed fallback stylesheet.");
}
