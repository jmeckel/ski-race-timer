import { describe, it, expect, beforeEach } from 'vitest';
import { updateButtonGroupState } from '../../../src/utils/uiHelpers';

describe('updateButtonGroupState', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    container.innerHTML = `
      <button class="run-btn" data-run="1">R1</button>
      <button class="run-btn" data-run="2">R2</button>
    `;
  });

  it('sets active class on matching button', () => {
    updateButtonGroupState(container, '.run-btn', 'data-run', '1');
    const buttons = container.querySelectorAll('.run-btn');
    expect(buttons[0]!.classList.contains('active')).toBe(true);
    expect(buttons[1]!.classList.contains('active')).toBe(false);
  });

  it('switches active state to different button', () => {
    updateButtonGroupState(container, '.run-btn', 'data-run', '2');
    const buttons = container.querySelectorAll('.run-btn');
    expect(buttons[0]!.classList.contains('active')).toBe(false);
    expect(buttons[1]!.classList.contains('active')).toBe(true);
  });

  it('handles null container gracefully', () => {
    expect(() => updateButtonGroupState(null, '.run-btn', 'data-run', '1')).not.toThrow();
  });

  it('handles no matching buttons', () => {
    expect(() => updateButtonGroupState(container, '.nonexistent', 'data-run', '1')).not.toThrow();
  });

  it('removes active class when no value matches', () => {
    updateButtonGroupState(container, '.run-btn', 'data-run', '1');
    updateButtonGroupState(container, '.run-btn', 'data-run', '3');
    const buttons = container.querySelectorAll('.run-btn');
    expect(buttons[0]!.classList.contains('active')).toBe(false);
    expect(buttons[1]!.classList.contains('active')).toBe(false);
  });
});
