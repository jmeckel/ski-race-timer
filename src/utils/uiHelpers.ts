/**
 * Update active state of buttons in a button group.
 * Toggles 'active' class based on matching a data attribute value.
 *
 * @param container - Parent element containing the buttons
 * @param selector - CSS selector for the buttons (e.g., '.run-btn')
 * @param attr - Data attribute to match against (e.g., 'data-run')
 * @param activeValue - Value that should be active (e.g., '1')
 */
export function updateButtonGroupState(
  container: Element | null,
  selector: string,
  attr: string,
  activeValue: string,
): void {
  if (!container) return;
  container.querySelectorAll(selector).forEach((btn) => {
    const isActive = btn.getAttribute(attr) === activeValue;
    btn.classList.toggle('active', isActive);
  });
}
