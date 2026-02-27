/**
 * Shared Test Helpers
 *
 * Utilities for unit tests: mock factories, DOM helpers, and
 * standardized ListenerManager mocks.
 *
 * Note: createMockEntry and createMockSettings live in tests/setup.js.
 * Typed factories (createEntry, createFault, createSettings) live in tests/helpers/factories.ts.
 * This file adds mock factories and DOM helpers that are NOT already covered.
 */

import { vi } from 'vitest';
import type { FaultEntry, FaultVersion } from '../src/types';

// ---------------------------------------------------------------------------
// Mock Factories
// ---------------------------------------------------------------------------

/**
 * Create a FaultEntry with sensible defaults matching the pattern used across
 * faultOperations.test.ts and faultOperations-coverage.test.ts.
 * Unlike the factory in tests/helpers/factories.ts, this returns deterministic
 * IDs (no random suffix) for assertion-friendly usage.
 */
export function createMockFault(
  overrides: Partial<FaultEntry> = {},
): FaultEntry {
  return {
    id: 'fault-1',
    bib: '042',
    run: 1,
    gateNumber: 5,
    faultType: 'MG',
    timestamp: '2024-01-15T12:00:00.000Z',
    deviceId: 'device-1',
    deviceName: 'Timer 1',
    gateRange: [1, 10],
    currentVersion: 1,
    versionHistory: [],
    markedForDeletion: false,
    ...overrides,
  };
}

/**
 * Create a FaultVersion object with sensible defaults.
 * Accepts partial overrides including nested `data` overrides.
 */
export function createMockFaultVersion(
  overrides: Partial<FaultVersion> & {
    data?: Partial<FaultVersion['data']>;
  } = {},
): FaultVersion {
  const { data: dataOverrides, ...rest } = overrides;
  return {
    version: 1,
    timestamp: '2024-01-15T11:00:00.000Z',
    editedBy: 'Timer 1',
    editedByDeviceId: 'device-1',
    changeType: 'create',
    data: {
      id: 'fault-1',
      bib: '042',
      run: 1,
      gateNumber: 5,
      faultType: 'MG',
      timestamp: '2024-01-15T10:00:00.000Z',
      deviceId: 'device-1',
      deviceName: 'Timer 1',
      gateRange: [1, 10] as [number, number],
      ...dataOverrides,
    } as FaultVersion['data'],
    ...rest,
  };
}

// ---------------------------------------------------------------------------
// DOM Helpers
// ---------------------------------------------------------------------------

/**
 * Create a div container and append it to document.body.
 * Call `container.remove()` in afterEach to clean up.
 */
export function createTestContainer(): HTMLDivElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  return container;
}

/**
 * Create an element with a given tag and id, optionally appending it to a parent.
 * Returns the element cast to HTMLElement.
 */
export function createElementWithId<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  id: string,
  parent?: HTMLElement,
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  el.id = id;
  if (parent) {
    parent.appendChild(el);
  }
  return el;
}

/**
 * Set up a flat DOM structure for testing: a container element and sibling
 * elements, all appended to the same parent. This matches the production
 * code's use of `document.getElementById()` for element lookup (not scoped
 * `querySelector` on the modal).
 *
 * NOTE: Children are siblings of the container, not nested inside it.
 * This is intentional — the production code uses global getElementById.
 *
 * Example:
 * ```ts
 * const els = setupModalDOM('fault-edit-modal', [
 *   'fault-edit-bib-input',
 *   'fault-edit-gate-input',
 * ], container);
 * // els['fault-edit-modal'] is the modal div
 * // els['fault-edit-bib-input'] is an input element (sibling of modal)
 * ```
 *
 * Elements whose id contains 'input' are created as `<input>`,
 * those containing 'select' as `<select>`, those containing 'textarea' as
 * `<textarea>`, those containing 'btn' as `<button>`, and everything else
 * as `<div>`.
 */
export function setupModalDOM(
  containerId: string,
  childIds: string[],
  parent?: HTMLElement,
): Record<string, HTMLElement> {
  const target = parent ?? document.body;

  const containerEl = document.createElement('div');
  containerEl.id = containerId;
  target.appendChild(containerEl);

  const result: Record<string, HTMLElement> = {
    [containerId]: containerEl,
  };

  for (const childId of childIds) {
    let tag: keyof HTMLElementTagNameMap = 'div';
    if (childId.includes('input')) tag = 'input';
    else if (childId.includes('select')) tag = 'select';
    else if (childId.includes('textarea') || childId.includes('notes'))
      tag = 'textarea';
    else if (childId.includes('btn')) tag = 'button';
    else if (
      childId.includes('span') ||
      childId.includes('count') ||
      childId.includes('range') ||
      childId.includes('label')
    )
      tag = 'span';

    const el = document.createElement(tag);
    el.id = childId;
    // Append children to the parent container, not the modal itself,
    // matching the existing test patterns where elements are siblings.
    target.appendChild(el);
    result[childId] = el;
  }

  return result;
}

// ---------------------------------------------------------------------------
// ListenerManager Mock Factory
// ---------------------------------------------------------------------------

/**
 * Tracked listener entry used by the ListenerManager mock.
 */
interface TrackedListener {
  el: EventTarget;
  event: string;
  handler: EventListenerOrEventListenerObject;
  options?: boolean | AddEventListenerOptions;
}

/**
 * Create a standardised ListenerManager mock.
 *
 * Options:
 * - `useRealBinding` (default: true) — when true, `add()` calls
 *   `el.addEventListener()` so event handlers actually fire in tests.
 *   When false, `add()` is a no-op spy (faster but handlers don't fire).
 * - `trackCalls` (default: true) — when true, keeps an array of all
 *   registered listeners accessible via the returned `tracked` property,
 *   and `removeAll()` cleans them up properly.
 *
 * Usage in vi.mock:
 * ```ts
 * import { createListenerManagerMock } from '../../testHelpers';
 *
 * vi.mock('../../src/utils/listenerManager', () => ({
 *   ListenerManager: vi.fn().mockImplementation(() =>
 *     createListenerManagerMock()
 *   ),
 * }));
 * ```
 */
export function createListenerManagerMock(
  options: { useRealBinding?: boolean; trackCalls?: boolean } = {},
): {
  add: ReturnType<typeof vi.fn>;
  removeAll: ReturnType<typeof vi.fn>;
  tracked: TrackedListener[];
} {
  const { useRealBinding = true, trackCalls = true } = options;
  const tracked: TrackedListener[] = [];

  const add = vi.fn(
    (
      el: EventTarget,
      event: string,
      handler: EventListenerOrEventListenerObject,
      opts?: boolean | AddEventListenerOptions,
    ) => {
      if (useRealBinding) {
        el.addEventListener(event, handler, opts);
      }
      if (trackCalls) {
        tracked.push({ el, event, handler, options: opts });
      }
    },
  );

  const removeAll = vi.fn(() => {
    if (useRealBinding && trackCalls) {
      for (const { el, event, handler, options: opts } of tracked) {
        el.removeEventListener(event, handler, opts);
      }
    }
    tracked.length = 0;
  });

  return { add, removeAll, tracked };
}
