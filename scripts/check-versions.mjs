import { readFile } from "node:fs/promises";

const packageJson = JSON.parse(await readFile("package.json", "utf8"));
const manifest = JSON.parse(await readFile("manifest.json", "utf8"));
const versions = JSON.parse(await readFile("versions.json", "utf8"));
const releaseVersionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-beta\.(0|[1-9]\d*))?$/;

if (packageJson.version !== manifest.version) {
  throw new Error(`package.json (${packageJson.version}) and manifest.json (${manifest.version}) versions differ.`);
}
if (!releaseVersionPattern.test(manifest.version)) {
  throw new Error(
    `Version ${manifest.version} must use MAJOR.MINOR.PATCH or MAJOR.MINOR.PATCH-beta.N without a v prefix.`,
  );
}
if (versions[manifest.version] !== manifest.minAppVersion) {
  throw new Error(
    `versions.json must map ${manifest.version} to minimum Obsidian ${manifest.minAppVersion}.`,
  );
}

console.log(`Version metadata is consistent: ${manifest.version}`);
