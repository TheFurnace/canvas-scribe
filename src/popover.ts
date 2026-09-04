export interface RectangleLike {
  top: number;
  right: number;
  bottom: number;
  left: number;
  width: number;
  height: number;
}

export interface PopupPosition {
  left: number;
  top: number;
}

export function positionPopup(
  anchor: RectangleLike,
  popup: Pick<RectangleLike, "width" | "height">,
  viewportWidth: number,
  viewportHeight: number,
  gap = 8,
  margin = 8,
): PopupPosition {
  let left = anchor.right + gap;
  if (left + popup.width > viewportWidth - margin) left = anchor.left - popup.width - gap;
  left = Math.max(margin, Math.min(left, viewportWidth - popup.width - margin));
  const top = Math.max(margin, Math.min(anchor.top, viewportHeight - popup.height - margin));
  return { left, top };
}
