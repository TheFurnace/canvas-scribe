import { build } from "esbuild";
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { writeReport } from "./spatial-report.mjs";

const output = resolve("dist/spatial-comparison");
mkdirSync(output, { recursive: true });
const bundle = resolve(output, "benchmark.mjs");
await build({ entryPoints: ["scripts/spatial/benchmark.ts"], bundle: true, platform: "node", format: "esm", outfile: bundle });
const args = process.argv.slice(2).filter(a => a !== "--");
const result = spawnSync(process.execPath, ["--expose-gc", bundle, ...args], { stdio: "inherit", windowsHide: true });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
if (!args.includes("--memory") && !args.includes("--skip-memory")) {
  const memory = [];
  for (const scene of ["canvas", "crossing"]) for (const algorithm of ["scan", "rbush", "grid-64", "grid-256", "grid-1024"]) {
    const child = spawnSync(process.execPath, ["--expose-gc", bundle, "--memory", `--algorithm=${algorithm}`, `--scene=${scene}`, `--sizes=${args.includes("--quick") ? 3000 : 10000}`], { encoding: "utf8", windowsHide: true });
    if (child.error) throw child.error;
    if (child.status !== 0) throw Error(child.stderr || `Memory process failed: ${algorithm}`);
    memory.push(JSON.parse(child.stdout));
    console.error(`Memory: ${scene} / ${algorithm}`);
  }
  writeFileSync(resolve(output, "memory.json"), JSON.stringify({ method: "One isolated process per case; median of three forced-GC heap deltas; excludes document and shared bounds", results: memory }, null, 2) + "\n");
}
if (!args.includes("--memory")) console.log(writeReport(output, !args.includes("--skip-memory")));
