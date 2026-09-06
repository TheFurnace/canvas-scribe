// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createColorPicker } from "../src/color-picker";
import { ToolColors } from "../src/colors";

afterEach(() => document.body.replaceChildren());
function fixture() {
  const onConfirm = vi.fn(), onCancel = vi.fn();
  const root = createColorPicker(document, { tool: "pen", current: "#123456", defaultColor: "#eeeeee", recent: ["#abcdef"], onConfirm, onCancel });
  document.body.append(root);
  const click = (name: string) => {
    const button = Array.from(root.querySelectorAll("button")).find((b) => b.textContent === name || b.getAttribute("aria-label") === name)!;
    button.click();
  };
  const inputs = Array.from(root.querySelectorAll<HTMLInputElement>(".canvas-scribe-picker-inputs input"));
  const enter = (index: number, value: string) => { inputs[index].value = value; inputs[index].dispatchEvent(new Event("input")); };
  return { root, click, enter, inputs, onConfirm, onCancel };
}
describe("color picker transactions", () => {
  it("previews recent colors without applying and discards edits on cancel", () => {
    const f = fixture();
    f.click("Use #abcdef");
    expect(f.inputs[0].value).toBe("#abcdef");
    expect(f.onConfirm).not.toHaveBeenCalled();
    f.click("Cancel");
    expect(f.onCancel).toHaveBeenCalledOnce();
    expect(f.onConfirm).not.toHaveBeenCalled();
  });
  it("round-trips Hex and RGB, preserves partial typing, and blocks invalid confirmation", () => {
    const f = fixture();
    f.enter(0, "abc");
    expect(f.inputs[0].value).toBe("abc");
    expect(f.inputs.slice(1).map((i) => i.value)).toEqual(["170", "187", "204"]);
    f.enter(0, "abcdef");
    f.enter(1, "255");
    expect(f.inputs[0].value).toBe("#ffcdef");
    for (const invalid of ["", "256", "-1", "1.5", "1e2"]) {
      f.enter(2, invalid);
      f.click("Done");
      expect(f.onConfirm).not.toHaveBeenCalled();
    }
    f.enter(2, "0");
    f.click("Done");
    expect(f.onConfirm).toHaveBeenCalledWith("#ff00ef");
  });
  it("requires confirmation for reset and clears reset intent after another selection", () => {
    const f = fixture();
    f.click("Reset to default");
    expect(f.inputs[0].value).toBe("#eeeeee");
    expect(f.onConfirm).not.toHaveBeenCalled();
    f.click("Done");
    expect(f.onConfirm).toHaveBeenLastCalledWith(null);
    f.click("Use #abcdef");
    f.click("Done");
    expect(f.onConfirm).toHaveBeenLastCalledWith("#abcdef");
  });
  it("updates spectrum through keyboard and brightness, and cancels with Escape", () => {
    const f = fixture();
    f.click("Spectrum");
    const field = f.root.querySelector<HTMLElement>(".canvas-scribe-picker-field")!;
    field.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(f.inputs[0].value).not.toBe("#123456");
    const range = f.root.querySelector<HTMLInputElement>("input[type=range]")!;
    range.value = "0";
    range.dispatchEvent(new Event("input"));
    expect(f.inputs[0].value).toBe("#000000");
    field.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(f.onCancel).toHaveBeenCalledOnce();
    expect(f.onConfirm).not.toHaveBeenCalled();
  });
  it("keeps focus inside the dialog when tabbing past its ends", () => {
    const f = fixture();
    const buttons = f.root.querySelectorAll("button");
    buttons[buttons.length - 1].focus();
    buttons[buttons.length - 1].dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(buttons[0]);
  });
});

describe("tool color history", () => {
  it("deduplicates and orders confirmed colors per tool with a six-color bound", () => {
    const colors = new ToolColors();
    for (let i = 0; i < 8; i++) colors.confirm("pen", `#00000${i}`);
    colors.confirm("pen", "#ABCDEF");
    colors.confirm("pen", "#000007");
    colors.confirm("pen", "#abcdef");
    expect(colors.recent("pen")).toEqual(["#abcdef", "#000007", "#000006", "#000005", "#000004", "#000003"]);
    expect(colors.recent("highlighter")).toEqual([]);
    colors.confirm("pen", "broken");
    expect(colors.current("pen", "#ffffff")).toBe("#abcdef");
  });
  it("resets each tool independently and follows subsequent theme defaults", () => {
    const colors = new ToolColors();
    colors.confirm("pen", "#ff0000");
    colors.confirm("highlighter", "#00ff00");
    colors.confirm("pen", null);
    expect(colors.current("pen", "#111111")).toBe("#111111");
    expect(colors.current("pen", "#eeeeee")).toBe("#eeeeee");
    expect(colors.current("highlighter", "#fde047")).toBe("#00ff00");
    colors.confirm("highlighter", null);
    expect(colors.current("highlighter", "#fde047")).toBe("#fde047");
  });
});
