import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { parseArguments, prepareVault, resolveLayout, verifyVault } from "../scripts/sandbox-vault.mjs";

const temporaryDirectories = [];

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("sandbox vault tooling", () => {
  it("parses named and custom vault runs", () => {
    expect(parseArguments(["verify", "--name", "agent-2", "--vault", "./vault", "--json"])).toMatchObject({
      command: "verify",
      name: "agent-2",
      vault: "./vault",
      json: true,
    });
    expect(() => parseArguments(["--name", "../unsafe"])).toThrow(/Test name/);
  });

  it("keeps named runs isolated", async () => {
    const repositoryRoot = await fakeRepository();
    const first = resolveLayout({ name: "agent-a" }, repositoryRoot);
    const second = resolveLayout({ name: "agent-b" }, repositoryRoot);
    expect(first.vaultPath).not.toBe(second.vaultPath);
    expect(first.isManagedVault).toBe(true);
    expect(second.isManagedVault).toBe(true);
  });

  it("prepares and verifies a deterministic disposable vault", async () => {
    const repositoryRoot = await fakeRepository();
    const options = { name: "smoke" };
    const prepared = await prepareVault(options, repositoryRoot);
    const verified = await verifyVault(options, repositoryRoot);

    expect(prepared.status).toBe("ready");
    expect(verified.pluginFiles).toEqual(prepared.pluginFiles);
    expect(JSON.parse(await readFile(path.join(prepared.vaultPath, ".obsidian", "community-plugins.json"), "utf8"))).toEqual([
      "canvas-scribe",
    ]);
    expect(await readFile(path.join(prepared.pluginPath, "main.js"), "utf8")).toBe("main.js fixture\n");
  });

  it("detects a stale installed build", async () => {
    const repositoryRoot = await fakeRepository();
    const options = { name: "stale" };
    const prepared = await prepareVault(options, repositoryRoot);
    await writeFile(path.join(prepared.pluginPath, "main.js"), "stale\n");
    await expect(verifyVault(options, repositoryRoot)).rejects.toThrow(/does not match/);
  });

  it("preserves exploration state until reset is requested", async () => {
    const repositoryRoot = await fakeRepository();
    const options = { name: "persistent" };
    const prepared = await prepareVault(options, repositoryRoot);
    const canvasPath = path.join(prepared.vaultPath, "Canvas Scribe Smoke Test.canvas");
    await writeFile(canvasPath, '{"exploration":"kept"}\n');

    await prepareVault(options, repositoryRoot);
    expect(await readFile(canvasPath, "utf8")).toContain("kept");

    await prepareVault({ ...options, reset: true }, repositoryRoot);
    expect(await readFile(canvasPath, "utf8")).toBe("{}\n");
  });

  it("does not erase a custom vault", async () => {
    const repositoryRoot = await fakeRepository();
    const customVault = path.join(repositoryRoot, "custom-vault");
    await mkdir(customVault, { recursive: true });
    await writeFile(path.join(customVault, "keep.md"), "keep me\n");
    await prepareVault({ name: "custom", vault: customVault }, repositoryRoot);
    expect(await readFile(path.join(customVault, "keep.md"), "utf8")).toBe("keep me\n");
  });
});

async function fakeRepository() {
  const repositoryRoot = await mkdtemp(path.join(tmpdir(), "canvas-scribe-sandbox-"));
  temporaryDirectories.push(repositoryRoot);
  await mkdir(path.join(repositoryRoot, "sandbox", "fixture"), { recursive: true });
  for (const filename of ["main.js", "manifest.json", "styles.css"]) {
    await writeFile(path.join(repositoryRoot, filename), `${filename} fixture\n`);
  }
  await writeFile(path.join(repositoryRoot, "sandbox", "fixture", "Agent Playground.md"), "# Explore\n");
  await writeFile(path.join(repositoryRoot, "sandbox", "fixture", "Canvas Scribe Smoke Test.canvas"), "{}\n");
  return repositoryRoot;
}
