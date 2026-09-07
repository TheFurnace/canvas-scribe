import { setIcon } from "obsidian";
import { RadialSession, type RadialMenuAction } from "./radial-session";
export type { RadialMenuAction } from "./radial-session";
export { clampRadialMenuPosition } from "./radial-session";
export class RadialMenu extends RadialSession {
  constructor(document: Document, actions: readonly RadialMenuAction[], onClose: () => void) {
    super(document, actions, onClose, setIcon);
  }
}
