import { createAction, createMenuShell, createNumericControl } from "./ui-controls";

export function createCircularSize(document: Document, options: {
  value: number; min: number; max: number; step: number; label: string;
  onChange: (value: number) => void; onBack: () => void; onClose: () => void;
  preview: (value: number) => Element;
  hero?: (document: Document) => Element;
  embedded?: boolean;
  unit?: string;
  half?: "left" | "right";
  inkColor?: string;
}): HTMLElement {
  const backdrop = document.createElement("div"); backdrop.className = "canvas-scribe-size-backdrop";
  const root = options.embedded ? document.createElement("div") : createMenuShell(document, options.label, options.onClose);
  if (options.embedded) root.className = "canvas-scribe-radial-control";
  root.style.position = "relative";
  const ring = document.createElement("div"); ring.className = "canvas-scribe-size-ring";
  ring.setAttribute("role", "slider"); ring.tabIndex = 0;
  ring.setAttribute("aria-label", options.label); ring.setAttribute("aria-valuemin", String(options.min)); ring.setAttribute("aria-valuemax", String(options.max));
  const output = document.createElement("output");
  if (options.half) root.classList.add(`is-${options.half}-half`);
  else if (options.embedded) root.classList.add("is-width-arc");
  if (!options.embedded) ring.append(output);
  if (options.hero) { ring.classList.add("has-tool"); ring.prepend(options.hero(document)); }
  const preview = document.createElement("div"); preview.className = "canvas-scribe-size-preview";
  let value = options.value, pointer: number | null = null, lastAngle: number | null = null;
  let continuousValue = value, dragStartValue = value;
  const sweep = options.embedded ? options.half ? 164 : 300 : 360;
  const disk = options.embedded ? document.createElementNS("http://www.w3.org/2000/svg", "svg") : null;
  const scale = disk ? document.createElementNS(disk.namespaceURI, "g") : null;
  if (disk && scale) {
    disk.classList.add("canvas-scribe-adjustment-disk"); disk.setAttribute("viewBox", "-6 -6 208 208"); disk.setAttribute("aria-hidden", "true");
    disk.append(scale); ring.append(disk); ring.classList.add("has-disk");
  }
  const opacityBand = options.embedded && options.half === "right" ? document.createElement("div") : null;
  if (opacityBand) { opacityBand.className = "canvas-scribe-opacity-disk"; ring.prepend(opacityBand); }
  function drawDisk() {
    if (!scale) return;
    const position = (value - options.min) / (options.max - options.min) * sweep;
    const midpoint = options.half === "right" ? 0 : 180;
    scale.setAttribute("transform", `rotate(${midpoint - position} 98 98)`);
    const point = (angle: number, radius: number) => `${98 + Math.cos(angle * Math.PI / 180) * radius} ${98 + Math.sin(angle * Math.PI / 180) * radius}`;
    const parts: Element[] = [];
    const start = position - 180;
    const fraction = (angle: number) => Math.max(0, Math.min(1, angle / sweep));
    if (opacityBand) {
      const stops = Array.from({ length: 73 }, (_, index) => {
        const alpha = .05 + .95 * fraction(start + index * 5);
        return `color-mix(in srgb, ${options.inkColor ?? "var(--text-normal)"} ${alpha * 100}%, transparent) ${index * 5}deg`;
      });
      opacityBand.style.background = `conic-gradient(from ${start + 90}deg, ${stops.join(",")})`;
      opacityBand.style.transform = `rotate(${midpoint - position}deg)`;
    } else {
      // A single filled contour has no alpha-composited joins between samples.
      const outer: string[] = [], inner: string[] = [];
      for (let i = 0; i <= 360; i++) {
        const theta = start + i, halfWidth = (3 + 17 * fraction(theta)) / 2;
        outer.push(point(theta, 90 + halfWidth)); inner.unshift(point(theta, 90 - halfWidth));
      }
      const band = document.createElementNS(disk!.namespaceURI, "path");
      band.classList.add("canvas-scribe-width-band");
      band.setAttribute("d", `M ${outer.join(" L ")} L ${inner.join(" L ")} Z`);
      band.setAttribute("fill", options.inkColor ?? "var(--text-normal)"); parts.push(band);
    }
    for (let angle = Math.ceil(start / 10) * 10; angle <= position + 180; angle += 10) {
      if (angle >= 0 && angle <= sweep && angle % 10 === 0) {
        const tick = document.createElementNS(disk!.namespaceURI, "path");
        tick.setAttribute("d", `M ${point(angle, 97)} L ${point(angle, angle % 30 === 0 ? 92 : 94)}`);
        tick.setAttribute("stroke", "var(--text-muted)"); tick.setAttribute("stroke-width", "1"); parts.push(tick);
      }
    }
    scale.replaceChildren(...parts);
  }
  const control = createNumericControl(document, {
    ...options, unit: "units", onChange: (next) => update(next),
  });
  const settledValue = (next: number) => Math.max(options.min, Math.min(options.max, Math.round(next / options.step) * options.step));
  function update(next: number) {
    value = settledValue(next);
    control.setValue(value); options.onChange(value); sync();
  }
  function sync() {
    const displayedValue = settledValue(value);
    output.value = `${Number(displayedValue.toFixed(2))}${options.unit ?? ""}`; ring.setAttribute("aria-valuenow", String(displayedValue));
    ring.setAttribute("aria-valuetext", output.value);
    ring.style.setProperty("--size-angle", `${(options.embedded ? options.half ? 164 : 300 : 360) * (value - options.min) / (options.max - options.min)}deg`);
    drawDisk();
    preview.replaceChildren(options.preview(Math.max(options.min, Math.min(options.max, value))));
  }
  const angle = (event: PointerEvent) => {
    const box = ring.getBoundingClientRect();
    return Math.atan2(event.clientY - box.top - box.height / 2, event.clientX - box.left - box.width / 2);
  };
  ring.addEventListener("pointerdown", (event) => {
    if (pointer !== null || event.button !== 0) return;
    event.preventDefault(); pointer = event.pointerId; dragStartValue = value; continuousValue = value; lastAngle = angle(event); ring.setPointerCapture(pointer); ring.focus();
  });
  ring.addEventListener("pointermove", (event) => {
    if (event.pointerId !== pointer || lastAngle === null) return;
    const next = angle(event); let delta = next - lastAngle;
    if (delta > Math.PI) delta -= Math.PI * 2; if (delta < -Math.PI) delta += Math.PI * 2;
    lastAngle = next;
    continuousValue += (options.embedded ? -delta : delta) / (Math.PI * sweep / 180) * (options.max - options.min);
    value = continuousValue; sync();
  });
  const finish = (commit: boolean) => {
    if (pointer === null) return;
    const id = pointer; pointer = null; lastAngle = null;
    if (commit) update(continuousValue);
    else { value = dragStartValue; sync(); }
    if (ring.hasPointerCapture(id)) ring.releasePointerCapture(id);
  };
  ring.addEventListener("pointerup", (event) => { if (event.pointerId === pointer) finish(true); });
  ring.addEventListener("pointercancel", (event) => { if (event.pointerId === pointer) finish(false); });
  ring.addEventListener("lostpointercapture", () => finish(false));
  ring.addEventListener("keydown", (event) => {
    const next = event.key === "Home" ? options.min : event.key === "End" ? options.max
      : ["ArrowUp", "ArrowRight"].includes(event.key) ? value + options.step
      : ["ArrowDown", "ArrowLeft"].includes(event.key) ? value - options.step : null;
    if (next !== null) { event.preventDefault(); update(next); }
  });
  if (options.embedded) {
    const pill = document.createElement("div"); pill.className = "canvas-scribe-radial-value-pill";
    pill.setAttribute("aria-hidden", "true"); preview.className = "canvas-scribe-radial-value-preview";
    pill.append(preview, output); root.append(ring, pill); sync(); return root;
  }
  root.append(ring, preview, control.root, createAction(document, "Back to Settings", options.onBack)); backdrop.append(root); sync(); return backdrop;
}
