// @vitest-environment happy-dom
import { expect, it, vi } from "vitest";
import { DebugConsole, type DebugConsoleState } from "../src/debug-console";
import { DebugLogger } from "../src/debug-logger";

it("refreshes shared control state after actions without replacing the focused button", async () => {
  const state: DebugConsoleState = { version: "test", prediction: 0, delegated: true, colors: false, recording: false, input: false };
  const move = vi.fn(), logger = new DebugLogger();
  const panel = new DebugConsole(document, () => state, () => logger.snapshot(), () => { state.prediction = 32; state.delegated = false; }, move);
  document.body.append(panel.root);
  const button = panel.root.querySelector<HTMLButtonElement>('[data-debug-action="toggle-ink-prediction"]')!;
  button.focus(); button.click(); await Promise.resolve();
  expect(button.textContent).toContain("32 ms"); expect(document.activeElement).toBe(button);
  expect(panel.root.querySelector('[data-debug-action="toggle-delegated-ink"]')?.getAttribute("aria-pressed")).toBe("false");
  Array.from(panel.root.querySelectorAll("button")).find(b => b.textContent === "Move to left sidebar")!.click();
  expect(move).toHaveBeenCalledWith("left"); panel.destroy(); expect(panel.root.isConnected).toBe(false);
});

it("renders bounded text-only event snapshots on explicit refresh", () => {
  const logger = new DebugLogger();
  for (let i = 0; i < 50; i++) logger.record("test", `entry-${i}`, { text: "<img src=x onerror=alert(1)>" });
  const snapshot = vi.fn(() => logger.snapshot());
  const panel = new DebugConsole(document, () => ({ version: "test", prediction: 0, delegated: false, colors: false, recording: false, input: false }), snapshot, vi.fn(), vi.fn());
  expect(panel.root.querySelector("pre")!.textContent).toContain("Latest 40 events");
  expect(panel.root.querySelector("pre")!.textContent).not.toContain("entry-9\n");
  expect(panel.root.querySelector("img")).toBeNull();
  logger.record("test", "new-event"); expect(snapshot).toHaveBeenCalledTimes(1);
  expect(panel.root.querySelector("pre")!.textContent).not.toContain("new-event");
  Array.from(panel.root.querySelectorAll("button")).find(b => b.textContent === "Refresh recent events")!.click();
  expect(panel.root.querySelector("pre")!.textContent).toContain("new-event"); panel.destroy();
});
