/** True when a key press belongs to a text field rather than to the drawing shortcuts. */
export function isTyping(target: EventTarget | null): boolean {
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  if (target instanceof HTMLInputElement) {
    return !["checkbox", "radio", "button", "submit", "range", "color"].includes(target.type);
  }
  return target instanceof HTMLElement && target.isContentEditable;
}
