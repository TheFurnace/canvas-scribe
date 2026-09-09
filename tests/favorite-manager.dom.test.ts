// @vitest-environment happy-dom
import { afterEach, expect, it } from "vitest";
import { createFavoriteManager } from "../src/favorite-manager";
import { FavoritePens } from "../src/favorite-pens";

afterEach(() => document.body.replaceChildren());
it("edits both highlighter tips and the full width range transactionally", () => {
  const store = new FavoritePens();
  store.add({ tool: "highlighter", penType: "fountain", highlighterType: "chisel", size: 60, opacity: 0.38, color: null });
  const original = store.list()[0]!;
  document.body.append(createFavoriteManager(document, store, null, () => "#fde047", () => undefined));
  const click = (label: string) => Array.from(document.querySelectorAll("button")).find((button) => button.textContent === label)!.click();
  const tip = () => document.querySelectorAll<HTMLSelectElement>("select")[1]!;
  const size = () => document.querySelector<HTMLInputElement>('[aria-label="Thickness"]')!;
  click("Edit");
  expect(size().max).toBe("60"); expect(size().value).toBe("60"); expect(tip().value).toBe("chisel");
  tip().value = "round"; size().value = "55"; size().dispatchEvent(new Event("input"));
  const cancel = Array.from(document.querySelectorAll("button")).find((button) => button.textContent === "Cancel")!;
  cancel.focus(); cancel.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }));
  expect(document.activeElement).toBe(document.querySelector("select"));
  tip().dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
  expect(store.list()[0]).toEqual(original);
  click("Edit"); tip().value = "round"; click("Save changes");
  expect(store.list()[0]).toEqual({ ...original, highlighterType: "round" });
  click("Edit");
  const tool = document.querySelector<HTMLSelectElement>("select")!;
  tool.value = "pencil"; tool.dispatchEvent(new Event("change"));
  expect(size().max).toBe("20"); expect(size().value).toBe("20");
  click("Save changes");
  expect(new FavoritePens(store.list()).list()[0]).toMatchObject({ id: original.id, tool: "pen", penType: "pencil", size: 20, opacity: 0.38 });
});
