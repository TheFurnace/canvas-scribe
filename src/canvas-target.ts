import type { TFile, View, WorkspaceLeaf } from "obsidian";

export interface CanvasTarget {
  leaf: WorkspaceLeaf;
  view: View;
  file: TFile;
  containerEl: HTMLElement;
}

type FileBackedView = View & { file?: TFile | null };

export function targetFromLeaf(leaf: WorkspaceLeaf): CanvasTarget | null {
  const view = leaf.view;
  if (view.getViewType() !== "canvas") return null;
  const file = (view as FileBackedView).file;
  if (!file || file.extension !== "canvas") return null;
  return { leaf, view, file, containerEl: view.containerEl };
}
