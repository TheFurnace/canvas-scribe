// Evaluate through sandbox:agent eval. Reads the saved Canvas through Obsidian.
(async () => {
  const file = app.workspace.getActiveFile();
  if (!file || file.extension !== 'canvas') throw new Error('Open a Canvas first');
  const data = JSON.parse(await app.vault.read(file));
  return {
    file: file.path,
    strokes: (data.canvasScribe?.strokes ?? []).map(stroke => ({
      id: stroke.id,
      tool: stroke.tool,
      points: stroke.points.length,
      hasPressure: stroke.hasPressure,
      pressureRange: [Math.min(...stroke.points.map(p => p.pressure)), Math.max(...stroke.points.map(p => p.pressure))],
    })),
  };
})()
