// Pure reconciliation of the preview pane's visible tab strip.
//
// Visibility is tracked by file path, not by index into the files array —
// indices go stale whenever files are added/removed/reordered, which used to
// leave open tabs invisible until the list happened to be rebuilt.
//
// Rules:
// - Newly opened files go to the front of the strip.
// - Previously visible tabs that are still open keep their slots.
// - Spare slots are refilled from the overflow, so tabs are only hidden when
//   more than maxVisible files are actually open.
export function reconcileVisiblePaths(prevPaths, currPaths, visiblePaths, maxVisible) {
  const newPaths = currPaths.filter(p => !prevPaths.includes(p));

  const next = [
    ...newPaths,
    ...visiblePaths.filter(p => currPaths.includes(p) && !newPaths.includes(p)),
  ];
  for (const p of currPaths) {
    if (next.length >= maxVisible) break;
    if (!next.includes(p)) next.push(p);
  }

  return { visible: next.slice(0, maxVisible), newPaths };
}
