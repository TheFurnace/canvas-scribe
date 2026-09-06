import { createHash } from "node:crypto";
import { access, cp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export const PLUGIN_ID = "canvas-scribe";
export const PLUGIN_FILES = ["main.js", "manifest.json", "styles.css"];
export const FIXTURE_FILES = ["Agent Playground.md", "Canvas Scribe Smoke Test.canvas"];
export const MANAGED_MARKER = ".canvas-scribe-sandbox-vault.json";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultRepositoryRoot = path.resolve(scriptDirectory, "..");

export function parseArguments(argumentsList) {
  const options = { command: "prepare", name: process.env.CANVAS_SCRIBE_SANDBOX_ID ?? "default" };
  const values = [...argumentsList];
  if (values[0] === "prepare" || values[0] === "verify") options.command = values.shift();

  while (values.length > 0) {
    const argument = values.shift();
    if (argument === "--name") options.name = requiredValue(argument, values.shift());
    else if (argument === "--vault") options.vault = requiredValue(argument, values.shift());
    else if (argument === "--reset") options.reset = true;
    else if (argument === "--json") options.json = true;
    else if (argument === "--help" || argument === "-h") options.help = true;
    else throw new Error(`Unknown argument: ${argument}`);
  }

  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(options.name)) {
    throw new Error("Test name may contain only letters, numbers, dots, underscores, and hyphens.");
  }
  return options;
}

export function resolveLayout(options, repositoryRoot = defaultRepositoryRoot) {
  const generatedRoot = path.join(repositoryRoot, ".canvas-scribe-sandbox");
  const managedVaultRoot = path.join(generatedRoot, "vaults");
  const vaultPath = options.vault ? path.resolve(options.vault) : path.join(managedVaultRoot, options.name);
  return {
    repositoryRoot,
    generatedRoot,
    managedVaultRoot,
    vaultPath,
    pluginPath: path.join(vaultPath, ".obsidian", "plugins", PLUGIN_ID),
    artifactPath: path.join(generatedRoot, "artifacts", options.name),
    isManagedVault: isPathInside(vaultPath, managedVaultRoot),
  };
}

export async function prepareVault(options, repositoryRoot = defaultRepositoryRoot) {
  const layout = resolveLayout(options, repositoryRoot);
  await assertBuildArtifacts(layout.repositoryRoot);
  const vaultExists = await pathExists(layout.vaultPath);
  if (layout.isManagedVault && vaultExists) {
    await assertManagedVault(layout.vaultPath);
    if (options.reset) await resetManagedVault(layout.vaultPath, layout.managedVaultRoot);
  }

  await mkdir(layout.pluginPath, { recursive: true });
  await mkdir(layout.artifactPath, { recursive: true });
  await copyMissingFiles(path.join(layout.repositoryRoot, "sandbox", "fixture"), layout.vaultPath, FIXTURE_FILES);
  await copyFiles(layout.repositoryRoot, layout.pluginPath, PLUGIN_FILES);
  await writeJson(path.join(layout.vaultPath, ".obsidian", "community-plugins.json"), [PLUGIN_ID]);
  await writeJson(path.join(layout.vaultPath, ".obsidian", "app.json"), { showInlineTitle: false });
  await writeJson(path.join(layout.vaultPath, MANAGED_MARKER), {
    schemaVersion: 1,
    pluginId: PLUGIN_ID,
    generatedBy: "scripts/sandbox-vault.mjs",
  });

  const verification = await verifyVault(options, repositoryRoot);
  await writeJson(path.join(layout.artifactPath, "setup.json"), verification);
  return verification;
}

export async function verifyVault(options, repositoryRoot = defaultRepositoryRoot) {
  const layout = resolveLayout(options, repositoryRoot);
  await assertBuildArtifacts(layout.repositoryRoot);
  const marker = await readJson(path.join(layout.vaultPath, MANAGED_MARKER));
  if (marker.pluginId !== PLUGIN_ID) throw new Error(`Not a ${PLUGIN_ID} test vault: ${layout.vaultPath}`);

  const enabledPlugins = await readJson(path.join(layout.vaultPath, ".obsidian", "community-plugins.json"));
  if (!Array.isArray(enabledPlugins) || !enabledPlugins.includes(PLUGIN_ID)) {
    throw new Error(`${PLUGIN_ID} is not enabled in the test vault.`);
  }

  const hashes = {};
  for (const filename of PLUGIN_FILES) {
    const sourceHash = await hashFile(path.join(layout.repositoryRoot, filename));
    const installedHash = await hashFile(path.join(layout.pluginPath, filename));
    if (sourceHash !== installedHash) throw new Error(`Installed ${filename} does not match the current build.`);
    hashes[filename] = sourceHash;
  }
  for (const filename of FIXTURE_FILES) await access(path.join(layout.vaultPath, filename), fsConstants.R_OK);

  return {
    schemaVersion: 1,
    status: "ready",
    sandboxName: options.name,
    vaultPath: layout.vaultPath,
    artifactPath: layout.artifactPath,
    pluginPath: layout.pluginPath,
    pluginFiles: hashes,
    fixtureFiles: FIXTURE_FILES,
  };
}

async function resetManagedVault(vaultPath, managedVaultRoot) {
  if (!isPathInside(vaultPath, managedVaultRoot) || path.resolve(vaultPath) === path.resolve(managedVaultRoot)) {
    throw new Error(`Refusing to reset unsafe vault path: ${vaultPath}`);
  }
  try {
    const existing = await stat(vaultPath);
    if (!existing.isDirectory()) throw new Error(`Test vault path is not a directory: ${vaultPath}`);
    const marker = await readJson(path.join(vaultPath, MANAGED_MARKER));
    if (marker.pluginId !== PLUGIN_ID) throw new Error(`Refusing to reset unrecognized directory: ${vaultPath}`);
    await rm(vaultPath, { recursive: true, force: false });
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

async function assertManagedVault(vaultPath) {
  const existing = await stat(vaultPath);
  if (!existing.isDirectory()) throw new Error(`Sandbox vault path is not a directory: ${vaultPath}`);
  const marker = await readJson(path.join(vaultPath, MANAGED_MARKER));
  if (marker.pluginId !== PLUGIN_ID) throw new Error(`Refusing to modify unrecognized directory: ${vaultPath}`);
}

async function assertBuildArtifacts(repositoryRoot) {
  for (const filename of PLUGIN_FILES) {
    try {
      await access(path.join(repositoryRoot, filename), fsConstants.R_OK);
    } catch {
      throw new Error(`Missing ${filename}. Run \"pnpm build\" or \"pnpm test:local\" first.`);
    }
  }
}

async function copyFiles(sourceDirectory, targetDirectory, filenames) {
  await mkdir(targetDirectory, { recursive: true });
  await Promise.all(filenames.map((filename) => cp(path.join(sourceDirectory, filename), path.join(targetDirectory, filename))));
}

async function copyMissingFiles(sourceDirectory, targetDirectory, filenames) {
  await mkdir(targetDirectory, { recursive: true });
  for (const filename of filenames) {
    const target = path.join(targetDirectory, filename);
    if (!(await pathExists(target))) await cp(path.join(sourceDirectory, filename), target);
  }
}

async function pathExists(filename) {
  try {
    await access(filename, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function hashFile(filename) {
  return createHash("sha256").update(await readFile(filename)).digest("hex");
}

async function readJson(filename) {
  return JSON.parse(await readFile(filename, "utf8"));
}

async function writeJson(filename, value) {
  await mkdir(path.dirname(filename), { recursive: true });
  await writeFile(filename, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function isPathInside(candidate, parent) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function requiredValue(flag, value) {
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value.`);
  return value;
}

function printHelp() {
  console.log(`Canvas Scribe disposable sandbox vault

Usage:
  node scripts/sandbox-vault.mjs prepare [--name ID] [--vault PATH] [--reset] [--json]
  node scripts/sandbox-vault.mjs verify  [--name ID] [--vault PATH] [--json]

The default vault is .canvas-scribe-sandbox/vaults/<name>. Set --name (or
CANVAS_SCRIBE_SANDBOX_ID) when multiple agents share a worktree. A custom --vault
is updated in place and is never recursively removed. Existing sandbox content is
preserved unless --reset is supplied.`);
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) return printHelp();
  const result = options.command === "prepare" ? await prepareVault(options) : await verifyVault(options);
  if (options.json) console.log(JSON.stringify(result));
  else {
    console.log(`Sandbox vault ${result.status}: ${result.vaultPath}`);
    console.log(`Sandbox artifacts: ${result.artifactPath}`);
    console.log("Open Canvas Scribe Smoke Test.canvas in Obsidian, then use Agent Playground.md.");
  }
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
