/**
 * Unit Tests for RadialDial Component
 * Tests: constructor, init, dial generation, number taps, bib adjustment,
 * rotation updates, value management, flash, destroy, visibility, resize
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// --- Mocks ---

vi.mock('../../../src/i18n/translations', () => ({
  t: vi.fn((key: string) => key),
}));

vi.mock('../../../src/services', () => ({
  feedbackDialDetent: vi.fn(),
  feedbackDialTap: vi.fn(),
}));

vi.mock('../../../src/store', () => ({
  store: {
    getState: vi.fn(() => ({ currentLang: 'en' })),
  },
}));

vi.mock('../../../src/utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock sub-modules: use a stable container so the vi.mock closure always reads current mocks
const mocks = {
  animation: null as Record<string, ReturnType<typeof vi.fn>> | null,
  interaction: null as Record<string, ReturnType<typeof vi.fn>> | null,
  resizeObserver: null as Record<string, ReturnType<typeof vi.fn>> | null,
  resizeCallback: null as ResizeObserverCallback | null,
};

function createMockAnimationInstance() {
  return {
    onDragStart: vi.fn(),
    onDragMove: vi.fn(),
    startMomentumSpin: vi.fn(),
    onDragEndNoMomentum: vi.fn(),
    pauseAnimations: vi.fn(),
    flash: vi.fn(),
    flashDigit: vi.fn(),
    flashPressed: vi.fn(),
    getRotation: vi.fn(() => 0),
    getVelocity: vi.fn(() => 0),
    destroy: vi.fn(),
  };
}

function createMockInteractionInstance() {
  return {
    bindEvents: vi.fn(),
    getDragState: vi.fn(() => ({
      isDragging: false,
      hasDraggedSignificantly: false,
    })),
    destroy: vi.fn(),
  };
}

vi.mock('../../../src/components/RadialDialAnimation', () => {
  return {
    RadialDialAnimation: vi.fn().mockImplementation(function () {
      return mocks.animation;
    }),
  };
});

vi.mock('../../../src/components/RadialDialInteraction', () => {
  return {
    RadialDialInteraction: vi.fn().mockImplementation(function () {
      return mocks.interaction;
    }),
  };
});

// ResizeObserver mock set up in beforeEach

// --- Helpers ---

function createDialContainer(): HTMLElement {
  const container = document.createElement('div');
  container.className = 'radial-dial';
  Object.defineProperty(container, 'offsetWidth', {
    value: 460,
    configurable: true,
  });

  const dialNumbers = document.createElement('div');
  dialNumbers.className = 'dial-numbers';
  container.appendChild(dialNumbers);

  const dialRing = document.createElement('div');
  dialRing.className = 'dial-ring';
  container.appendChild(dialRing);

  const dialTicks = document.createElement('div');
  dialTicks.className = 'dial-ticks';
  container.appendChild(dialTicks);

  document.body.appendChild(container);
  return container;
}

function createContainerWithoutDialNumbers(): HTMLElement {
  const container = document.createElement('div');
  container.className = 'radial-dial';
  document.body.appendChild(container);
  return container;
}

// --- Tests ---

describe('RadialDial Component', () => {
  let RadialDial: typeof import('../../../src/components/RadialDial').RadialDial;
  let RadialDialAnimation: typeof import('../../../src/components/RadialDialAnimation').RadialDialAnimation;
  let RadialDialInteraction: typeof import('../../../src/components/RadialDialInteraction').RadialDialInteraction;
  let feedbackDialDetent: ReturnType<typeof vi.fn>;
  let feedbackDialTap: ReturnType<typeof vi.fn>;
  let loggerWarn: ReturnType<typeof vi.fn>;
  let container: HTMLElement;

  beforeEach(async () => {
    // Recreate fresh mock instances
    mocks.animation = createMockAnimationInstance();
    mocks.interaction = createMockInteractionInstance();
    mocks.resizeObserver = {
      observe: vi.fn(),
      unobserve: vi.fn(),
      disconnect: vi.fn(),
    };
    mocks.resizeCallback = null;

    globalThis.ResizeObserver = vi.fn().mockImplementation(function (
      cb: ResizeObserverCallback,
    ) {
      mocks.resizeCallback = cb;
      return mocks.resizeObserver;
    });

    // Re-import to get fresh references
    const mod = await import('../../../src/components/RadialDial');
    RadialDial = mod.RadialDial;

    const animMod = await import('../../../src/components/RadialDialAnimation');
    RadialDialAnimation = animMod.RadialDialAnimation;

    const intMod = await import(
      '../../../src/components/RadialDialInteraction'
    );
    RadialDialInteraction = intMod.RadialDialInteraction;

    // Re-apply mockImplementation because global setup.ts calls vi.clearAllMocks()
    // which strips the implementation set in the vi.mock factory
    (
      RadialDialAnimation as unknown as ReturnType<typeof vi.fn>
    ).mockImplementation(function () {
      return mocks.animation;
    });
    (
      RadialDialInteraction as unknown as ReturnType<typeof vi.fn>
    ).mockImplementation(function () {
      return mocks.interaction;
    });

    const services = await import('../../../src/services');
    feedbackDialDetent = services.feedbackDialDetent as unknown as ReturnType<
      typeof vi.fn
    >;
    feedbackDialTap = services.feedbackDialTap as unknown as ReturnType<
      typeof vi.fn
    >;

    const loggerMod = await import('../../../src/utils/logger');
    loggerWarn = loggerMod.logger.warn as unknown as ReturnType<typeof vi.fn>;
  });

  afterEach(() => {
    // Clean up any containers left in the DOM
    document.body.innerHTML = '';
  });

  // --- Constructor ---

  describe('constructor', () => {
    it('should create instance with container and initialize animation sub-module', () => {
      container = createDialContainer();
      const onChange = vi.fn();

      const dial = new RadialDial(container, { onChange });

      // RadialDialAnimation should have been constructed
      expect(RadialDialAnimation).toHaveBeenCalledTimes(1);
      // The first arg is a callbacks object, second is config
      const animCall = (
        RadialDialAnimation as unknown as ReturnType<typeof vi.fn>
      ).mock.calls[0];
      expect(animCall[1]).toEqual({
        momentum: 1.5,
        friction: 0.97,
        sensitivity: 24,
      });

      dial.destroy();
    });

    it('should use default options when none provided', () => {
      container = createDialContainer();

      const dial = new RadialDial(container);

      const animCall = (
        RadialDialAnimation as unknown as ReturnType<typeof vi.fn>
      ).mock.calls[0];
      expect(animCall[1]).toEqual({
        momentum: 1.5,
        friction: 0.97,
        sensitivity: 24,
      });

      dial.destroy();
    });

    it('should accept custom options overriding defaults', () => {
      container = createDialContainer();

      const dial = new RadialDial(container, {
        momentum: 2.0,
        friction: 0.95,
        sensitivity: 30,
      });

      const animCall = (
        RadialDialAnimation as unknown as ReturnType<typeof vi.fn>
      ).mock.calls[0];
      expect(animCall[1]).toEqual({
        momentum: 2.0,
        friction: 0.95,
        sensitivity: 30,
      });

      dial.destroy();
    });

    it('should initialize interaction sub-module and call bindEvents', () => {
      container = createDialContainer();

      const dial = new RadialDial(container);

      expect(RadialDialInteraction).toHaveBeenCalledTimes(1);
      expect(mocks.interaction!.bindEvents).toHaveBeenCalledTimes(1);

      dial.destroy();
    });
  });

  // --- init ---

  describe('init', () => {
    it('should warn and return early if .dial-numbers not found', () => {
      container = createContainerWithoutDialNumbers();

      const dial = new RadialDial(container);

      expect(loggerWarn).toHaveBeenCalledWith(
        '[RadialDial] Required elements not found',
      );
      // Interaction module should NOT have been created since init returned early
      expect(RadialDialInteraction).not.toHaveBeenCalled();

      dial.destroy();
    });

    it('should find .dial-numbers and .dial-ring elements and generate numbers and ticks', () => {
      container = createDialContainer();

      const dial = new RadialDial(container);

      const numbers = container.querySelectorAll('.dial-number');
      expect(numbers.length).toBe(10);

      const ticks = container.querySelectorAll('.dial-tick');
      expect(ticks.length).toBe(60);

      dial.destroy();
    });
  });

  // --- generateDialNumbers ---

  describe('generateDialNumbers', () => {
    it('should create 10 dial-number divs with digits 1-9 and 0', () => {
      container = createDialContainer();

      const dial = new RadialDial(container);

      const numberEls = container.querySelectorAll('.dial-number');
      expect(numberEls.length).toBe(10);

      const digits = Array.from(numberEls).map((el) =>
        el.getAttribute('data-num'),
      );
      expect(digits).toEqual([
        '1',
        '2',
        '3',
        '4',
        '5',
        '6',
        '7',
        '8',
        '9',
        '0',
      ]);

      dial.destroy();
    });

    it('should position numbers using radius = containerSize * 0.38', () => {
      container = createDialContainer();

      const dial = new RadialDial(container);

      // Container is 460px wide, so radius = 460 * 0.38 = 174.8, center = 230
      const firstNumber = container.querySelector(
        '.dial-number',
      ) as HTMLElement;
      expect(firstNumber).not.toBeNull();

      // First number (1) is at angle index 0: (0 * 36 - 90) degrees = -90deg
      // At -90deg: cos(-90) = 0, sin(-90) = -1
      // x = 230 + 174.8 * 0 = 230, y = 230 + 174.8 * (-1) = 55.2
      const left = parseFloat(firstNumber.style.left);
      const top = parseFloat(firstNumber.style.top);
      expect(left).toBeCloseTo(230, 0);
      expect(top).toBeCloseTo(55.2, 0);

      dial.destroy();
    });

    it('should set aria attributes on each number element', () => {
      container = createDialContainer();

      const dial = new RadialDial(container);

      const numberEls = container.querySelectorAll('.dial-number');
      numberEls.forEach((el) => {
        expect(el.getAttribute('role')).toBe('button');
        expect(el.getAttribute('tabindex')).toBe('0');
        expect(el.getAttribute('aria-label')).toMatch(/^numberLabel \d$/);
      });

      dial.destroy();
    });

    it('should add keydown handlers that trigger handleNumberTap on Enter', () => {
      container = createDialContainer();
      const onChange = vi.fn();

      const dial = new RadialDial(container, { onChange });

      const numberEl = container.querySelector('[data-num="5"]') as HTMLElement;
      expect(numberEl).not.toBeNull();

      // Simulate Enter keydown
      const event = new KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
      });
      Object.defineProperty(event, 'preventDefault', { value: vi.fn() });
      numberEl.dispatchEvent(event);

      // Should have appended digit 5 and called onChange
      expect(onChange).toHaveBeenCalledWith('5');
      expect(feedbackDialTap).toHaveBeenCalledTimes(1);

      dial.destroy();
    });

    it('should add keydown handlers that trigger handleNumberTap on Space', () => {
      container = createDialContainer();
      const onChange = vi.fn();

      const dial = new RadialDial(container, { onChange });

      const numberEl = container.querySelector('[data-num="3"]') as HTMLElement;

      const event = new KeyboardEvent('keydown', { key: ' ', bubbles: true });
      Object.defineProperty(event, 'preventDefault', { value: vi.fn() });
      numberEl.dispatchEvent(event);

      expect(onChange).toHaveBeenCalledWith('3');

      dial.destroy();
    });

    it('should contain a span child in each number element', () => {
      container = createDialContainer();

      const dial = new RadialDial(container);

      const numberEls = container.querySelectorAll('.dial-number');
      numberEls.forEach((el) => {
        const span = el.querySelector('span');
        expect(span).not.toBeNull();
        expect(span!.textContent).toBe(el.getAttribute('data-num'));
      });

      dial.destroy();
    });
  });

  // --- generateTicks ---

  describe('generateTicks', () => {
    it('should create 60 tick elements', () => {
      container = createDialContainer();

      const dial = new RadialDial(container);

      const ticks = container.querySelectorAll('.dial-tick');
      expect(ticks.length).toBe(60);

      dial.destroy();
    });

    it('should mark every 6th tick as major', () => {
      container = createDialContainer();

      const dial = new RadialDial(container);

      const majorTicks = container.querySelectorAll('.dial-tick.major');
      // indices 0, 6, 12, 18, 24, 30, 36, 42, 48, 54 => 10 major ticks
      expect(majorTicks.length).toBe(10);

      dial.destroy();
    });

    it('should set correct rotation transform on each tick', () => {
      container = createDialContainer();

      const dial = new RadialDial(container);

      const ticks = container.querySelectorAll('.dial-tick');
      ticks.forEach((tick, i) => {
        expect((tick as HTMLElement).style.transform).toBe(
          `rotate(${i * 6}deg)`,
        );
      });

      dial.destroy();
    });
  });

  // --- handleNumberTap ---

  describe('handleNumberTap (via keydown)', () => {
    it('should append digit to bib value and call onChange', () => {
      container = createDialContainer();
      const onChange = vi.fn();

      const dial = new RadialDial(container, { onChange });

      // Tap "1"
      const numEl1 = container.querySelector('[data-num="1"]') as HTMLElement;
      numEl1.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      expect(onChange).toHaveBeenCalledWith('1');
      expect(dial.getValue()).toBe('1');

      // Tap "2"
      const numEl2 = container.querySelector('[data-num="2"]') as HTMLElement;
      numEl2.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      expect(onChange).toHaveBeenCalledWith('12');
      expect(dial.getValue()).toBe('12');

      dial.destroy();
    });

    it('should not exceed 3 digits', () => {
      container = createDialContainer();
      const onChange = vi.fn();

      const dial = new RadialDial(container, { onChange });

      // Tap three digits
      const numEl = container.querySelector('[data-num="7"]') as HTMLElement;
      numEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      numEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      numEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

      expect(dial.getValue()).toBe('777');
      expect(onChange).toHaveBeenCalledTimes(3);

      // Fourth tap should be ignored
      numEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      expect(dial.getValue()).toBe('777');
      expect(onChange).toHaveBeenCalledTimes(3);

      dial.destroy();
    });

    it('should call feedbackDialTap and animation.flashPressed on tap', () => {
      container = createDialContainer();

      const dial = new RadialDial(container);

      const numEl = container.querySelector('[data-num="4"]') as HTMLElement;
      numEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

      expect(feedbackDialTap).toHaveBeenCalledTimes(1);
      expect(mocks.animation!.flashPressed).toHaveBeenCalledWith(numEl);

      dial.destroy();
    });
  });

  // --- adjustBib (tested indirectly via animation callbacks) ---

  describe('adjustBib (via animation onDigitChange callback)', () => {
    it('should increment bib value and call onChange and feedbackDialDetent', () => {
      container = createDialContainer();
      const onChange = vi.fn();

      const dial = new RadialDial(container, { onChange });

      // Get the onDigitChange callback that was passed to RadialDialAnimation
      const animCallbacks = (
        RadialDialAnimation as unknown as ReturnType<typeof vi.fn>
      ).mock.calls[0][0];
      const onDigitChange = animCallbacks.onDigitChange;

      // Increment from default (empty -> 0 + 1 = 1)
      onDigitChange(1);

      expect(onChange).toHaveBeenCalledWith('1');
      expect(feedbackDialDetent).toHaveBeenCalledTimes(1);

      dial.destroy();
    });

    it('should decrement bib value and clamp to 0', () => {
      container = createDialContainer();
      const onChange = vi.fn();

      const dial = new RadialDial(container, { onChange });

      const animCallbacks = (
        RadialDialAnimation as unknown as ReturnType<typeof vi.fn>
      ).mock.calls[0][0];
      const onDigitChange = animCallbacks.onDigitChange;

      // Decrement from 0: should clamp to 0
      onDigitChange(-1);

      expect(onChange).toHaveBeenCalledWith('0');

      dial.destroy();
    });

    it('should clamp bib value at 999', () => {
      container = createDialContainer();
      const onChange = vi.fn();

      const dial = new RadialDial(container, { onChange });
      dial.setValue('999');

      const animCallbacks = (
        RadialDialAnimation as unknown as ReturnType<typeof vi.fn>
      ).mock.calls[0][0];
      const onDigitChange = animCallbacks.onDigitChange;

      onDigitChange(1);

      // Should remain at 999
      expect(dial.getValue()).toBe('999');
      expect(onChange).toHaveBeenCalledWith('999');

      dial.destroy();
    });

    it('should flash the digit element corresponding to the last digit of the new bib', () => {
      container = createDialContainer();

      const dial = new RadialDial(container, {});

      const animCallbacks = (
        RadialDialAnimation as unknown as ReturnType<typeof vi.fn>
      ).mock.calls[0][0];
      const onDigitChange = animCallbacks.onDigitChange;

      // Increment from 0 -> 1, last digit is "1"
      onDigitChange(1);

      expect(mocks.animation!.flashDigit).toHaveBeenCalledTimes(1);
      // The element passed should be the one with data-num="1"
      const passedEl = mocks.animation!.flashDigit.mock.calls[0][0];
      expect(passedEl.getAttribute('data-num')).toBe('1');

      dial.destroy();
    });
  });

  // --- updateDialRotation (via animation onRotationUpdate callback) ---

  describe('updateDialRotation (via animation onRotationUpdate callback)', () => {
    it('should set transform rotate on dialNumbers and counter-rotate spans', () => {
      container = createDialContainer();

      const dial = new RadialDial(container);

      const animCallbacks = (
        RadialDialAnimation as unknown as ReturnType<typeof vi.fn>
      ).mock.calls[0][0];
      const onRotationUpdate = animCallbacks.onRotationUpdate;

      onRotationUpdate(45);

      const dialNumbers = container.querySelector(
        '.dial-numbers',
      ) as HTMLElement;
      expect(dialNumbers.style.transform).toBe('rotate(45deg)');

      // All spans should be counter-rotated
      const spans = dialNumbers.querySelectorAll('.dial-number span');
      spans.forEach((span) => {
        expect((span as HTMLElement).style.transform).toBe('rotate(-45deg)');
      });

      dial.destroy();
    });
  });

  // --- getValue / setValue / clear ---

  describe('value management', () => {
    it('getValue should return empty string initially', () => {
      container = createDialContainer();

      const dial = new RadialDial(container);

      expect(dial.getValue()).toBe('');

      dial.destroy();
    });

    it('setValue should set the bib value', () => {
      container = createDialContainer();

      const dial = new RadialDial(container);
      dial.setValue('42');

      expect(dial.getValue()).toBe('42');

      dial.destroy();
    });

    it('setValue should truncate to 3 characters', () => {
      container = createDialContainer();

      const dial = new RadialDial(container);
      dial.setValue('12345');

      expect(dial.getValue()).toBe('123');

      dial.destroy();
    });

    it('clear should reset bib value to empty string', () => {
      container = createDialContainer();

      const dial = new RadialDial(container);
      dial.setValue('99');
      dial.clear();

      expect(dial.getValue()).toBe('');

      dial.destroy();
    });
  });

  // --- flash ---

  describe('flash', () => {
    it('should delegate to animation.flash with dialRing and dialNumbers', () => {
      container = createDialContainer();

      const dial = new RadialDial(container);

      dial.flash();

      expect(mocks.animation!.flash).toHaveBeenCalledTimes(1);
      // Should be called with the dialRing and dialNumbers elements
      const args = mocks.animation!.flash.mock.calls[0];
      expect(args[0]).toBe(container.querySelector('.dial-ring'));
      expect(args[1]).toBe(container.querySelector('.dial-numbers'));

      dial.destroy();
    });
  });

  // --- destroy ---

  describe('destroy', () => {
    it('should destroy animation and interaction sub-modules', () => {
      container = createDialContainer();

      const dial = new RadialDial(container);

      dial.destroy();

      expect(mocks.animation!.destroy).toHaveBeenCalledTimes(1);
      expect(mocks.interaction!.destroy).toHaveBeenCalledTimes(1);
    });

    it('should disconnect ResizeObserver', () => {
      container = createDialContainer();

      const dial = new RadialDial(container);

      dial.destroy();

      expect(mocks.resizeObserver!.disconnect).toHaveBeenCalledTimes(1);
    });

    it('should remove visibilitychange event listener from document', () => {
      container = createDialContainer();
      const removeSpy = vi.spyOn(document, 'removeEventListener');

      const dial = new RadialDial(container);

      dial.destroy();

      expect(removeSpy).toHaveBeenCalledWith(
        'visibilitychange',
        expect.any(Function),
      );

      removeSpy.mockRestore();
    });

    it('should remove keydown listeners from number elements', () => {
      container = createDialContainer();

      const dial = new RadialDial(container);

      // Spy on removeEventListener of a number element
      const numEl = container.querySelector('[data-num="5"]') as HTMLElement;
      const removeSpy = vi.spyOn(numEl, 'removeEventListener');

      dial.destroy();

      expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function));

      removeSpy.mockRestore();
    });

    it('should be safe to call destroy twice (double-destroy guard)', () => {
      container = createDialContainer();

      const dial = new RadialDial(container);

      dial.destroy();
      dial.destroy(); // Should not throw

      // Sub-module destroy should only be called once
      expect(mocks.animation!.destroy).toHaveBeenCalledTimes(1);
      expect(mocks.interaction!.destroy).toHaveBeenCalledTimes(1);
    });
  });

  // --- Visibility handler ---

  describe('visibility handler', () => {
    it('should pause animations when document becomes hidden', () => {
      container = createDialContainer();

      const dial = new RadialDial(container);

      // Simulate document becoming hidden
      Object.defineProperty(document, 'hidden', {
        value: true,
        writable: true,
        configurable: true,
      });
      document.dispatchEvent(new Event('visibilitychange'));

      expect(mocks.animation!.pauseAnimations).toHaveBeenCalledTimes(1);

      // Reset
      Object.defineProperty(document, 'hidden', {
        value: false,
        writable: true,
        configurable: true,
      });

      dial.destroy();
    });

    it('should not pause animations when document becomes visible', () => {
      container = createDialContainer();

      const dial = new RadialDial(container);

      // Document is visible (default)
      Object.defineProperty(document, 'hidden', {
        value: false,
        writable: true,
        configurable: true,
      });
      document.dispatchEvent(new Event('visibilitychange'));

      expect(mocks.animation!.pauseAnimations).not.toHaveBeenCalled();

      dial.destroy();
    });
  });

  // --- ResizeObserver ---

  describe('ResizeObserver', () => {
    it('should observe the container element', () => {
      container = createDialContainer();

      const dial = new RadialDial(container);

      expect(mocks.resizeObserver!.observe).toHaveBeenCalledWith(container);

      dial.destroy();
    });

    it('should regenerate dial numbers when container width changes', () => {
      container = createDialContainer();

      const dial = new RadialDial(container);

      // Initial generation creates 10 numbers
      expect(container.querySelectorAll('.dial-number').length).toBe(10);

      // Simulate resize to a different width
      if (mocks.resizeCallback) {
        mocks.resizeCallback(
          [
            {
              contentRect: { width: 300, height: 300 } as DOMRectReadOnly,
              target: container,
              borderBoxSize: [],
              contentBoxSize: [],
              devicePixelContentBoxSize: [],
            } as ResizeObserverEntry,
          ],
          mocks.resizeObserver as unknown as ResizeObserver,
        );
      }

      // Numbers should still be 10 (regenerated, not duplicated)
      expect(container.querySelectorAll('.dial-number').length).toBe(10);

      dial.destroy();
    });

    it('should not regenerate dial numbers when width is unchanged', () => {
      container = createDialContainer();

      const dial = new RadialDial(container);

      // Clear the feedbackDialTap mock to track new calls
      feedbackDialTap.mockClear();

      // Get the existing number innerHTML to compare later
      const dialNumbers = container.querySelector(
        '.dial-numbers',
      ) as HTMLElement;
      const originalFirstChild = dialNumbers.firstChild;

      // Simulate resize with same width (460 matches initial offsetWidth)
      if (mocks.resizeCallback) {
        mocks.resizeCallback(
          [
            {
              contentRect: { width: 460, height: 460 } as DOMRectReadOnly,
              target: container,
              borderBoxSize: [],
              contentBoxSize: [],
              devicePixelContentBoxSize: [],
            } as ResizeObserverEntry,
          ],
          mocks.resizeObserver as unknown as ResizeObserver,
        );
      }

      // The DOM should NOT have been regenerated (same child reference)
      expect(dialNumbers.firstChild).toBe(originalFirstChild);

      dial.destroy();
    });

    it('should ignore resize entries with zero width', () => {
      container = createDialContainer();

      const dial = new RadialDial(container);

      const dialNumbers = container.querySelector(
        '.dial-numbers',
      ) as HTMLElement;
      const originalFirstChild = dialNumbers.firstChild;

      if (mocks.resizeCallback) {
        mocks.resizeCallback(
          [
            {
              contentRect: { width: 0, height: 0 } as DOMRectReadOnly,
              target: container,
              borderBoxSize: [],
              contentBoxSize: [],
              devicePixelContentBoxSize: [],
            } as ResizeObserverEntry,
          ],
          mocks.resizeObserver as unknown as ResizeObserver,
        );
      }

      // Should not regenerate when width is 0
      expect(dialNumbers.firstChild).toBe(originalFirstChild);

      dial.destroy();
    });
  });

  // --- Animation callbacks wiring ---

  describe('animation callback wiring', () => {
    it('should remove momentum class when animation completes', () => {
      container = createDialContainer();

      const dial = new RadialDial(container);

      const dialNumbers = container.querySelector(
        '.dial-numbers',
      ) as HTMLElement;
      dialNumbers.classList.add('momentum');

      // Get the onAnimationComplete callback
      const animCallbacks = (
        RadialDialAnimation as unknown as ReturnType<typeof vi.fn>
      ).mock.calls[0][0];
      animCallbacks.onAnimationComplete();

      expect(dialNumbers.classList.contains('momentum')).toBe(false);

      dial.destroy();
    });
  });
});
