declare const __CANVAS_SCRIBE_BUILD_ID__: string;

export const BUILD_ID =
  typeof __CANVAS_SCRIBE_BUILD_ID__ === "string" ? __CANVAS_SCRIBE_BUILD_ID__ : "development";
