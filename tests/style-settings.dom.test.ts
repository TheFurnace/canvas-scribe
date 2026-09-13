// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { toolSwatches, opaqueCssColor } from "../src/colors";
import { observeToolTheme, refreshToolThemes } from "../src/tool-theme";
import { InkToolState } from "../src/ink-tool-state";
import { FavoritePens } from "../src/favorite-pens";
import { PdfTools } from "../src/pdf-tools";
import { createToolColors, createToolMenu } from "../src/tool-suite";
import { createColorPicker } from "../src/color-picker";
import { RadialColors } from "../src/radial-colors";

const dispose: (() => void)[] = [];
afterEach(() => {
  dispose.splice(0).forEach(stop => stop());
  document.body.replaceChildren(); document.body.removeAttribute("class"); document.body.removeAttribute("style");
  document.head.querySelectorAll("[data-test-theme]").forEach(node => node.remove());
  vi.restoreAllMocks();
});
function theme(css = "body { --color-red: #bf616a; --color-orange: #d08770; --color-purple: #b48ead; --color-pink: #b48ead; }") {
  const style = document.createElement("style"); style.dataset.testTheme = "true";
  style.textContent = css; document.head.append(style); return style;
}
function enable() { document.body.classList.add("canvas-scribe-theme-palette"); }

it("keeps curated defaults and prepends unique resolved theme colors only when enabled", () => {
  theme(); const curated = toolSwatches("pen");
  expect(toolSwatches("pen", document)).toEqual(curated);
  enable();
  expect(toolSwatches("pen", document)).toEqual(["#bf616a", "#d08770", "#b48ead", ...curated]);
  expect(toolSwatches("highlighter", document)).toEqual(["#bf616a", "#d08770", "#b48ead", ...toolSwatches("highlighter")]);
  document.body.classList.remove("canvas-scribe-theme-palette");
  expect(toolSwatches("pen", document)).toEqual(curated);
});

it("uses optional aliases with per-role fallback and rejects missing or invalid colors", () => {
  theme("body { --color-red:#123; --canvas-scribe-color-red:#456; --color-orange:#456; --color-blue:#789; --canvas-scribe-color-blue:invalid; --color-pink:transparent; }"); enable();
  expect(toolSwatches("pen", document).slice(0, 3)).toEqual(["#445566", "#778899", toolSwatches("pen")[0]]);
  for (const invalid of ["", "inherit", "currentColor", "var(--missing)", "not-a-color", "bad", "abcdef", "transparent"]) {
    expect(opaqueCssColor(document, invalid)).toBeNull();
  }
});

it("uses the same collection across menus and stores chosen theme ink as fixed hex", () => {
  const style = theme(); enable(); const state = new InkToolState();
  const drawer = createToolColors(document, state, "pen", { defaultColor: "#bf616a", mount: vi.fn(), close: vi.fn(), changed: vi.fn() });
  expect(drawer.querySelector('[aria-label="Follow the theme ink color"]')?.getAttribute("aria-pressed")).toBe("true");
  const chip = drawer.querySelector<HTMLButtonElement>('[aria-label="Use #bf616a for pen"]')!;
  expect(chip.getAttribute("aria-pressed")).toBe("false"); chip.click();
  const menu = createToolMenu(document, vi.fn(), state, { color: () => "#bf616a", colors: vi.fn(), close: vi.fn(), changed: vi.fn(), count: 0, canClear: false, clear: vi.fn(), recolor: vi.fn(), scale: vi.fn() });
  expect(menu.querySelector('[aria-label="Use #bf616a"]')).not.toBeNull();
  const picker = createColorPicker(document, { tool: "pen", current: "#bf616a", defaultColor: "#111111", recent: [], onConfirm: vi.fn(), onCancel: vi.fn() });
  expect(picker.querySelectorAll('.canvas-scribe-picker-swatches button')).toHaveLength(toolSwatches("pen", document).length);
  const radial = new RadialColors("pen", "#bf616a", [], document);
  expect(radial.swatches).not.toContain("#bf616a"); expect(radial.swatches[0]).toBe("#d08770");
  const favorite = new FavoritePens(); favorite.add(state.preset()!);
  style.textContent = "body { --color-red:#123456; }";
  expect(toolSwatches("pen", document)[0]).toBe("#123456");
  expect(radial.swatches[0]).toBe("#d08770"); // Lifetime snapshot.
  expect(new InkToolState(state.serialize()).toolColors.selection("pen")).toBe("#bf616a");
  expect(state.toolColors.recent("pen")).toEqual(["#bf616a"]);
  expect(favorite.list()[0]?.color).toBe("#bf616a");
});

it("observes stylesheet-only edits, host notifications and late mirrored CSS, then disposes", async () => {
  const first = vi.fn(), second = vi.fn();
  const stop = observeToolTheme(document, first); dispose.push(stop);
  const frame = document.createElement("iframe"); document.body.append(frame);
  const other = frame.contentDocument!;
  dispose.push(observeToolTheme(other, second));
  const style = theme();
  await vi.waitFor(() => expect(first).toHaveBeenCalled()); first.mockClear();
  style.textContent = "body { --color-red:#010203; }";
  await vi.waitFor(() => expect(first).toHaveBeenCalled()); first.mockClear(); second.mockClear();
  refreshToolThemes(); refreshToolThemes();
  await vi.waitFor(() => { expect(first).toHaveBeenCalledOnce(); expect(second).toHaveBeenCalledOnce(); });
  second.mockClear(); const mirror = other.createElement("style"); other.head.append(mirror); mirror.textContent = style.textContent;
  await vi.waitFor(() => expect(second).toHaveBeenCalled());
  stop(); first.mockClear(); style.remove(); refreshToolThemes();
  await new Promise(resolve => setTimeout(resolve, 40)); expect(first).not.toHaveBeenCalled();
});

it("ignores drawing DOM changes and updates remaining listeners after one view closes", async () => {
  const a = vi.fn(), b = vi.fn(); const stopA = observeToolTheme(document, a);
  dispose.push(stopA, observeToolTheme(document, b));
  document.body.append(document.createElement("canvas"));
  await new Promise(resolve => setTimeout(resolve, 40)); expect(a).not.toHaveBeenCalled();
  stopA(); enable(); await vi.waitFor(() => expect(b).toHaveBeenCalledOnce()); expect(a).not.toHaveBeenCalled();
});

it("closes unconfirmed PDF picker edits on theme changes and retains the PDF default", async () => {
  const style = theme(); enable(); const state = new InkToolState();
  const pdf = new PdfTools(document, vi.fn(), { changed: vi.fn(), toggle: vi.fn(), undo: vi.fn(), redo: vi.fn(), clear: vi.fn(), scale: vi.fn(), recolor: vi.fn(), remove: vi.fn() }, new FavoritePens(), state);
  dispose.push(() => pdf.destroy()); document.body.append(pdf.root); pdf.sync(true, false, false, 0, false);
  pdf.root.querySelector('[data-action="color"]')!.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
  const more = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(b => b.textContent === "More colors…")!; more.click();
  const hex = document.querySelector<HTMLInputElement>('.canvas-scribe-picker-inputs input')!;
  hex.value = "abcdef"; hex.dispatchEvent(new Event("input"));
  style.textContent = "body { --text-normal:#eeeeee; --color-red:#654321; }";
  await vi.waitFor(() => expect(document.querySelector('.canvas-scribe-picker-backdrop')).toBeNull());
  expect(state.toolColors.selection("pen")).toBeNull(); expect(state.toolColors.recent("pen")).toEqual([]);
  expect(pdf.color()).toBe("#1f2937");
});
