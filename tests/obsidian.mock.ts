export class Notice {}

export function setIcon(container: HTMLElement, icon: string): void {
  container.setAttribute("data-icon", icon);
}
