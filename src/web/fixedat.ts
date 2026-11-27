/**
 * Place a `position: fixed` popup at a point on the screen. A popup in the
 * top bar opens under its button and outside the toolbar, which would
 * clip it. In the dark theme the top bar is drawn through a filter, which
 * makes the bar what a fixed popup is placed against, not the screen; the
 * popup is measured once placed and moved by the difference, so it lands
 * where it's meant to in either theme.
 */
export function fixedAt(node: HTMLElement, at: { x: number; y: number }) {
  const place = (p: { x: number; y: number }) => {
    node.style.left = `${p.x}px`;
    node.style.top = `${p.y}px`;
    const r = node.getBoundingClientRect();
    if (r.left !== p.x) node.style.left = `${2 * p.x - r.left}px`;
    if (r.top !== p.y) node.style.top = `${2 * p.y - r.top}px`;
  };
  place(at);
  return { update: place };
}
