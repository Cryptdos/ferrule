/**
 * Scrolling over a number box that has the focus steps it: by its step, or
 * ten steps with Shift held (note 42). Changes fire like typing would.
 */
export function installNumberWheel(): void {
  window.addEventListener(
    "wheel",
    (e) => {
      const t = e.target;
      if (!(t instanceof HTMLInputElement) || t.type !== "number" || document.activeElement !== t || t.disabled || t.readOnly) return;
      // Shift+wheel arrives sideways in some browsers.
      const delta = e.deltaY || e.deltaX;
      if (!delta) return;
      e.preventDefault();
      const step = Number(t.step) > 0 ? Number(t.step) : 1;
      let v = (Number(t.value) || 0) + (delta < 0 ? 1 : -1) * step * (e.shiftKey ? 10 : 1);
      if (t.min !== "" && v < Number(t.min)) v = Number(t.min);
      if (t.max !== "" && v > Number(t.max)) v = Number(t.max);
      // Keep to the step's decimals (0.1 + 0.2 shouldn't show as 0.30000000000000004).
      const places = (String(step).split(".")[1] ?? "").length;
      t.value = String(Number(v.toFixed(places)));
      t.dispatchEvent(new Event("input", { bubbles: true }));
      t.dispatchEvent(new Event("change", { bubbles: true }));
    },
    { passive: false, capture: true },
  );
}
