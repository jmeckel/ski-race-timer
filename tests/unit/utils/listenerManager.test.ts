/**
 * Unit Tests for ListenerManager
 * Tests: add(), removeAll(), count tracking, actual addEventListener/removeEventListener behavior
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ListenerManager } from '../../../src/utils/listenerManager';

describe('ListenerManager', () => {
  let manager: ListenerManager;

  beforeEach(() => {
    manager = new ListenerManager();
  });

  describe('count', () => {
    it('should start with zero listeners', () => {
      expect(manager.count).toBe(0);
    });

    it('should increment count when adding listeners', () => {
      const div = document.createElement('div');
      manager.add(div, 'click', () => {});
      expect(manager.count).toBe(1);

      manager.add(div, 'mouseover', () => {});
      expect(manager.count).toBe(2);
    });

    it('should reset count to zero after removeAll', () => {
      const div = document.createElement('div');
      manager.add(div, 'click', () => {});
      manager.add(div, 'keydown', () => {});
      expect(manager.count).toBe(2);

      manager.removeAll();
      expect(manager.count).toBe(0);
    });
  });

  describe('add', () => {
    it('should call addEventListener on the target', () => {
      const div = document.createElement('div');
      const spy = vi.spyOn(div, 'addEventListener');
      const handler = () => {};

      manager.add(div, 'click', handler);

      expect(spy).toHaveBeenCalledWith('click', handler, undefined);
    });

    it('should pass options to addEventListener', () => {
      const div = document.createElement('div');
      const spy = vi.spyOn(div, 'addEventListener');
      const handler = () => {};
      const options = { capture: true, passive: true };

      manager.add(div, 'scroll', handler, options);

      expect(spy).toHaveBeenCalledWith('scroll', handler, options);
    });

    it('should pass boolean capture option to addEventListener', () => {
      const div = document.createElement('div');
      const spy = vi.spyOn(div, 'addEventListener');
      const handler = () => {};

      manager.add(div, 'click', handler, true);

      expect(spy).toHaveBeenCalledWith('click', handler, true);
    });

    it('should actually register the event listener (handler fires on dispatch)', () => {
      const div = document.createElement('div');
      const handler = vi.fn();

      manager.add(div, 'click', handler);
      div.dispatchEvent(new Event('click'));

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should support adding listeners to window', () => {
      const spy = vi.spyOn(window, 'addEventListener');
      const handler = () => {};

      manager.add(window, 'resize', handler);

      expect(spy).toHaveBeenCalledWith('resize', handler, undefined);
      expect(manager.count).toBe(1);

      spy.mockRestore();
    });

    it('should support adding listeners to document', () => {
      const spy = vi.spyOn(document, 'addEventListener');
      const handler = () => {};

      manager.add(document, 'visibilitychange', handler);

      expect(spy).toHaveBeenCalledWith('visibilitychange', handler, undefined);
      expect(manager.count).toBe(1);

      spy.mockRestore();
    });

    it('should track multiple listeners on different targets', () => {
      const div1 = document.createElement('div');
      const div2 = document.createElement('div');

      manager.add(div1, 'click', () => {});
      manager.add(div2, 'click', () => {});
      manager.add(div1, 'keydown', () => {});

      expect(manager.count).toBe(3);
    });
  });

  describe('removeAll', () => {
    it('should call removeEventListener for each tracked listener', () => {
      const div = document.createElement('div');
      const handler1 = () => {};
      const handler2 = () => {};
      const removeSpy = vi.spyOn(div, 'removeEventListener');

      manager.add(div, 'click', handler1);
      manager.add(div, 'keydown', handler2);
      manager.removeAll();

      expect(removeSpy).toHaveBeenCalledWith('click', handler1, undefined);
      expect(removeSpy).toHaveBeenCalledWith('keydown', handler2, undefined);
      expect(removeSpy).toHaveBeenCalledTimes(2);
    });

    it('should pass options to removeEventListener', () => {
      const div = document.createElement('div');
      const handler = () => {};
      const options = { capture: true };
      const removeSpy = vi.spyOn(div, 'removeEventListener');

      manager.add(div, 'click', handler, options);
      manager.removeAll();

      expect(removeSpy).toHaveBeenCalledWith('click', handler, options);
    });

    it('should actually remove listeners (handler no longer fires)', () => {
      const div = document.createElement('div');
      const handler = vi.fn();

      manager.add(div, 'click', handler);
      div.dispatchEvent(new Event('click'));
      expect(handler).toHaveBeenCalledTimes(1);

      manager.removeAll();
      div.dispatchEvent(new Event('click'));
      expect(handler).toHaveBeenCalledTimes(1); // Still 1, not 2
    });

    it('should be safe to call removeAll when no listeners are tracked', () => {
      expect(() => manager.removeAll()).not.toThrow();
      expect(manager.count).toBe(0);
    });

    it('should be safe to call removeAll multiple times', () => {
      const div = document.createElement('div');
      manager.add(div, 'click', () => {});

      manager.removeAll();
      expect(() => manager.removeAll()).not.toThrow();
      expect(manager.count).toBe(0);
    });

    it('should remove listeners from multiple targets', () => {
      const div1 = document.createElement('div');
      const div2 = document.createElement('div');
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      manager.add(div1, 'click', handler1);
      manager.add(div2, 'click', handler2);

      manager.removeAll();

      div1.dispatchEvent(new Event('click'));
      div2.dispatchEvent(new Event('click'));

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).not.toHaveBeenCalled();
    });
  });
});
