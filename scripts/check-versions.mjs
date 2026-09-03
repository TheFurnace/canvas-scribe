import { readFile } from "node:fs/promises";

const packageJson = JSON.parse(await readFile("package.json", "utf8"));
const manifest = JSON.parse(await readFile("manifest.json", "utf8"));
const versions = JSON.parse(await readFile("versions.json", "utf8"));

if (packageJson.version !== manifest.version) {
  throw new Error(`package.json (${packageJson.version}) and manifest.json (${manifest.version}) versions differ.`);
}
if (versions[manifest.version] !== manifest.minAppVersion) {
  throw new Error(
    `versions.json must map ${manifest.version} to minimum Obsidian ${manifest.minAppVersion}.`,
  );
}

console.log(`Version metadata is consistent: ${manifest.version}`);
