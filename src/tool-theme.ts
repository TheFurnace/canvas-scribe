interface ThemeObservation {
  listeners: Set<() => void>;
  observer: MutationObserver;
  schedule(): void;
  cancel(): void;
}

const documents = new Map<Document, ThemeObservation>();

/** The host css-change event covers CSSOM changes as well as Style Settings. */
export function refreshToolThemes(): void {
  for (const observation of documents.values()) observation.schedule();
}

function isStylesheet(node: Node | null): boolean {
  return node?.nodeName === "STYLE" || node?.nodeName === "LINK";
}

/** One observer per owning document, including asynchronously mirrored popout CSS. */
export function observeToolTheme(document: Document, changed: () => void): () => void {
  let observation = documents.get(document);
  if (!observation) {
    const view = document.defaultView;
    if (!view) return () => {};
    const listeners = new Set<() => void>();
    let frame: number | null = null;
    const schedule = () => {
      if (frame !== null) return;
      frame = view.requestAnimationFrame(() => {
        frame = null;
        for (const listener of [...listeners]) listener();
      });
    };
    const observer = new view.MutationObserver(records => {
      if (records.some(record => record.target === document.body || record.target === document.documentElement
        || isStylesheet(record.target) || isStylesheet(record.target.parentNode)
        || [...Array.from(record.addedNodes), ...Array.from(record.removedNodes)].some(isStylesheet))) schedule();
    });
    for (const target of [document.documentElement, document.body]) {
      observer.observe(target, { attributes: true, attributeFilter: ["class", "style"] });
    }
    observer.observe(document.head, { childList: true, characterData: true, subtree: true,
      attributes: true, attributeFilter: ["href", "media", "disabled"] });
    observation = { listeners, observer, schedule, cancel: () => { if (frame !== null) view.cancelAnimationFrame(frame); } };
    documents.set(document, observation);
  }
  observation.listeners.add(changed);
  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    observation.listeners.delete(changed);
    if (!observation.listeners.size) {
      observation.observer.disconnect(); observation.cancel(); documents.delete(document);
    }
  };
}
