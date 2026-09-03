import esbuild from "esbuild";
import { copyFile, mkdir } from "node:fs/promises";
import process from "node:process";

const production = process.argv[2] === "production";
const buildId = process.env.CANVAS_SCRIBE_BUILD_ID ?? `local-${new Date().toISOString().replace(/[:.]/g, "-")}`;
const deployDirectory = process.env.CANVAS_SCRIBE_DEPLOY_DIR;
const deployPlugin = {
  name: "deploy-plugin",
  setup(build) {
    build.onEnd(async (result) => {
      if (!deployDirectory || result.errors.length > 0) return;
      await mkdir(deployDirectory, { recursive: true });
      await Promise.all(
        ["main.js", "manifest.json", "styles.css"].map((file) => copyFile(file, `${deployDirectory}/${file}`)),
      );
      console.log(`Canvas Scribe deployed to ${deployDirectory}`);
    });
  },
};
const context = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: ["obsidian", "electron", "@codemirror/*", "@lezer/*"],
  format: "cjs",
  target: "es2018",
  logLevel: "info",
  sourcemap: production ? false : "inline",
  treeShaking: true,
  define: { __CANVAS_SCRIBE_BUILD_ID__: JSON.stringify(buildId) },
  plugins: [deployPlugin],
  outfile: "main.js"
});

if (production) {
  await context.rebuild();
  await context.dispose();
} else {
  await context.watch();
}
