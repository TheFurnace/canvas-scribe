import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function writeReport(directory, includeMemory = true) {
  const data = JSON.parse(readFileSync(resolve(directory, "results.json"), "utf8"));
  const names = ["scan", "rbush", "grid-64", "grid-256", "grid-1024"];
  const labels = ["Cached scan", "RBush", "Grid 64", "Grid 256", "Grid 1024"];
  const largest = Math.max(...data.metadata.sizes);
  const fmt = n => n.toFixed(4);
  const queryCell = row => `${fmt(row.medianMs)} / ${fmt(row.p95Ms)}`;
  const table = (header, rows) => `| ${header.join(" | ")} |\n| ${header.map(() => "---").join(" | ")} |\n${rows.map(row => `| ${row.join(" | ")} |`).join("\n")}\n`;
  const find = (scene, size, name) => data.results.find(r => r.scene === scene && r.strokes === size && r.algorithm === name);
  let report = `# Spatial lookup comparison\n\nGenerated ${data.metadata.timestamp}. ${data.metadata.node}, ${data.metadata.platform}/${data.metadata.arch}, ${data.metadata.cpu}. RBush ${data.metadata.rbush}, default node size 9. ${data.metadata.quick ? "PILOT" : "FULL"} run.\n\n`;
  report += "All timings are milliseconds. Candidate-query cells show **median / p95**, including exact bounding-box filtering, highlighter filtering, deduplication and original stroke ordering. These are Node CPU measurements, not Obsidian presentation or Galaxy/S Pen latency.\n\n";
  report += `## Candidate queries at ${largest.toLocaleString()} strokes\n\n`;
  const rows = [];
  for (const scene of ["canvas", "clusters", "note", "crossing"]) for (const kind of ["eraser", "empty", "lasso", "viewport"]) {
    rows.push([`${scene}: ${kind}`, ...names.map(name => queryCell(find(scene, largest, name).query[kind]))]);
  }
  report += table(["Fixture / query", ...labels], rows);
  report += "\n## Canvas eraser-query scaling\n\n";
  report += table(["Strokes", ...labels], data.metadata.sizes.map(size => [String(size), ...names.map(name => queryCell(find("canvas", size, name).query.eraser))]));
  report += `\n## Build and edit costs at ${largest.toLocaleString()} strokes\n\nMedians. Warm build uses already cached bounds. Cold load + first query includes computing fresh bounds, but excludes creating/deserializing the input objects. The 5% edit includes immutable transforms, synthetic split replacements and ordered-array reconciliation shared by all approaches; index-only time is a subset. Undo assumes the previous document array is available from history.\n\n`;
  report += "Edit + next query also includes the scan's deferred bounds calculation for changed strokes.\n\n";
  report += table(["Fixture", "Algorithm", "Warm build", "Cold load + query", "5% edit", "Edit + next query", "Index update only", "Undo index only"], data.results.filter(r => r.strokes === largest).map(r => [r.scene, r.algorithm, fmt(r.warmBuild.medianMs), fmt(r.coldBuildAndFirstQuery.medianMs), fmt(r.edit5Percent.medianMs), fmt(r.editAndFirstQuery.medianMs), fmt(r.indexUpdateOnly.medianMs), fmt(r.undoIndexOnly.medianMs)]));
  report += "\n## Eraser pipeline\n\nCandidate lookup + production eraseInk geometry + ordered-array reconciliation + index maintenance. Excludes rendering, history checkpoints, saving and pointer-event dispatch. Ten warmup rounds, fifteen measured rounds, rotating algorithm order each round. IDs generated for equivalent fragments are excluded from geometry equality checks. Cells show median / p95.\n\n";
  report += table(["Strokes / mode", ...labels], [1000, 10000].flatMap(size => ["stroke", "area"].map(mode => [`${size} / ${mode}`, ...names.map(name => queryCell(data.eraseResults.find(r => r.strokes === size && r.mode === mode && r.algorithm === name).pipeline))])));
  if (includeMemory) {
    const memory = JSON.parse(readFileSync(resolve(directory, "memory.json"), "utf8"));
    report += `\n## Incremental retained index memory\n\n${memory.method}. MiB are approximate; tiny or negative deltas are GC noise, not meaningful savings. Input strokes, sample points and the common bounds cache are excluded.\n\n`;
    report += table(["Fixture", "Strokes", "Algorithm", "Extra heap MiB", "Cell references", "Oversized fallback entries"], memory.results.map(r => [r.scene, String(r.strokes), r.algorithm, (r.heapBytes / 1048576).toFixed(3), String(r.stats.references ?? "—"), String(r.stats.oversized ?? "—")]));
  }
  report += "\n## Method and limitations\n\n- Deterministic seed 91; 80 samples per stroke, variable widths, 1/7 highlighters and periodic frozen fragments. Sizes: " + data.metadata.sizes.join(", ") + ".\n";
  report += "- Canvas distributes ink over a 16,000-unit square; clusters packs it into 16 handwriting regions; note uses five columns and increasing vertical extent; crossing gives 20% of strokes 24,000-unit diagonal extents. Crossing is intentionally adversarial for bounding-box lookup.\n";
  report += `- ${data.metadata.passes} measured query passes after two warmup passes; ${data.metadata.quick ? 128 : 256} queries/pass, evenly split between hit-oriented eraser boxes, remote empty space, lasso boxes and viewport boxes. Half the hit-oriented eraser queries filter highlighters. Candidate-count summaries are in results.json.\n`;
  report += "- Grids use document-space cell sizes 64/256/1024. Each stroke occupies at most 64 cells; oversized entries are checked linearly. Queries covering over 4096 cells fall back to all stored entries. This bounded hybrid avoids allocating thousands of cells for one long stroke.\n";
  report += "- The scan uses the production strokeCandidateBounds cache as its broad-phase kernel. RBush/grid entries snapshot those same conservative bounds and receive explicit edit deltas. Query results must be identical and in document order. Precise ink geometry remains the final authority.\n";
  report += "- Query, replacement/split/deletion, undo and reload candidate equivalence is checked outside timing. Correctness tests also cover negative coordinates, touching boundaries, empty strokes, oversized queries and live-append refresh. A missed index update remains an integration risk.\n";
  report += "- The synthetic 5% batch does not include finding changes from arbitrary snapshots. Production integration must supply edit deltas or pay for reconciliation/rebuild, including redo, external edits and multiple views.\n";
  report += "- No spatial index has been installed in the plugin. This benchmark compares prototypes using current stroke geometry. No PDF page partitioning, browser DOM cost or physical device acceptance is inferred. The one-hit eraser pipeline uses ordinary ink; it does not measure the separate expensive long-highlighter outline construction.\n";
  report += "- Different JavaScript runtimes, stroke distributions, overlap and GC affect results. Microsecond differences should be interpreted as tradeoffs, not universal rankings. Run again before making a deployment decision.\n";
  const file = resolve(directory, "report.md"); writeFileSync(file, report); return file;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) console.log(writeReport(resolve(process.argv[2] ?? "dist/spatial-comparison"), !process.argv.includes("--no-memory")));
