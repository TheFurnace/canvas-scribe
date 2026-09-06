export function resolveHandwritingRegion<T>(
  stylusIsHovering: boolean,
  hoveredRegion: T | null,
  focusedRegion: T | null,
): T | null {
  return stylusIsHovering ? hoveredRegion : focusedRegion;
}

export function isHandwritingRegionTarget(
  targetIsEditable: boolean,
  nodeIsEditing: boolean,
  targetIsEmbeddedEditor: boolean,
): boolean {
  return targetIsEditable || (nodeIsEditing && targetIsEmbeddedEditor);
}

export function createHandwritingHint(document: Document): HTMLElement {
  const hint = document.createElement("div");
  hint.className = "canvas-scribe-handwriting-hint";
  hint.setAttribute("aria-hidden", "true");
  hint.textContent = "Handwriting → text";
  return hint;
}
