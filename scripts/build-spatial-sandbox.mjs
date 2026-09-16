import { build } from "esbuild";
import { readFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

// Explicit output to a named disposable vault. Normal builds never load this adapter.
const name = process.argv[2];
if (!name || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name)) throw Error("Supply a disposable sandbox name");
const vault = resolve(".canvas-scribe-sandbox/vaults", name);
await readFile(resolve(vault, ".obsidian/plugins/canvas-scribe/manifest.json"));
await mkdir("dist/spatial-comparison", { recursive: true });
await build({
  entryPoints: ["src/main.ts"], bundle: true, format: "cjs", target: "es2018", mainFields: ["module", "main"],
  external: ["obsidian", "electron", "@codemirror/*", "@lezer/*"],
  define: { __CANVAS_SCRIBE_BUILD_ID__: JSON.stringify("FER-91-spatial-sandbox-experiment") },
  outfile: resolve(vault, ".obsidian/plugins/canvas-scribe/main.js"),
  plugins: [{ name: "sandbox-only-eraser", setup(builder) {
    builder.onLoad({ filter: /canvas-ink-layer\.ts$/ }, async ({ path }) => {
      let contents = await readFile(path, "utf8");
      const call = "const result = eraseInk(this.data.strokes,";
      if (contents.split(call).length !== 2) throw Error("Canvas eraser call changed; review experiment adapter");
      contents = 'import { sandboxErase } from "../scripts/spatial/sandbox-adapter";\n' + contents.replace(call, "const result = sandboxErase(this.data.strokes,");
      return { contents, loader: "ts", resolveDir: resolve("src") };
    });
  } }],
});
console.log(`Experimental build installed only in ${vault}. Reload this sandbox to activate.`);
