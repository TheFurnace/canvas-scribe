export function resolveHandwritingRegion<T>(
  stylusIsHovering: boolean,
  hoveredRegion: T | null,
  focusedRegion: T | null,
): T | null {
  return stylusIsHovering ? hoveredRegion : focusedRegion;
}
