/**
 * Unit Tests for Recent Races UI Utility
 * Tests: renderRecentRaceItem(), renderRecentRaceItems(), attachRecentRaceItemHandlers()
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock dependencies
vi.mock('../../../src/store', () => ({
  store: {
    getState: vi.fn(() => ({ currentLang: 'en' })),
  },
}));

vi.mock('../../../src/i18n/translations', () => ({
  t: vi.fn((key: string) => {
    const translations: Record<string, string> = {
      entries: 'entries',
      race: 'Race',
    };
    return translations[key] || key;
  }),
}));

import {
  renderRecentRaceItem,
  renderRecentRaceItems,
  attachRecentRaceItemHandlers,
} from '../../../src/utils/recentRacesUi';
import type { RecentRace } from '../../../src/utils/recentRaces';

describe('Recent Races UI', () => {
  const makeRace = (overrides: Partial<RecentRace> = {}): RecentRace => ({
    raceId: 'RACE-001',
    createdAt: Date.now(),
    lastUpdated: Date.now(),
    ...overrides,
  });

  describe('renderRecentRaceItem', () => {
    it('should render a race item with race ID', () => {
      const html = renderRecentRaceItem(makeRace({ raceId: 'ABCD1234' }));
      expect(html).toContain('ABCD1234');
      expect(html).toContain('recent-race-item');
    });

    it('should include data-race-id attribute', () => {
      const html = renderRecentRaceItem(makeRace({ raceId: 'XYZ' }));
      expect(html).toContain('data-race-id="XYZ"');
    });

    it('should include tabindex and role for accessibility', () => {
      const html = renderRecentRaceItem(makeRace());
      expect(html).toContain('tabindex="0"');
      expect(html).toContain('role="option"');
    });

    it('should include aria-label with race ID', () => {
      const html = renderRecentRaceItem(makeRace({ raceId: 'TESTRACE' }));
      expect(html).toContain('aria-label=');
      expect(html).toContain('TESTRACE');
    });

    it('should render entry count when available', () => {
      const html = renderRecentRaceItem(makeRace({ entryCount: 15 }));
      expect(html).toContain('15 entries');
    });

    it('should not render entry count when undefined', () => {
      const html = renderRecentRaceItem(makeRace({ entryCount: undefined }));
      expect(html).toContain('recent-race-meta');
      // The meta span should be empty
      expect(html).toContain('<span class="recent-race-meta"></span>');
    });

    it('should escape HTML in race ID', () => {
      const html = renderRecentRaceItem(makeRace({ raceId: '<script>alert(1)</script>' }));
      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;script&gt;');
    });
  });

  describe('renderRecentRaceItems', () => {
    it('should render multiple race items', () => {
      const races = [
        makeRace({ raceId: 'RACE-A' }),
        makeRace({ raceId: 'RACE-B' }),
        makeRace({ raceId: 'RACE-C' }),
      ];
      const html = renderRecentRaceItems(races);
      expect(html).toContain('RACE-A');
      expect(html).toContain('RACE-B');
      expect(html).toContain('RACE-C');
    });

    it('should return empty string for empty array', () => {
      expect(renderRecentRaceItems([])).toBe('');
    });

    it('should render each item with recent-race-item class', () => {
      const races = [makeRace({ raceId: 'R1' }), makeRace({ raceId: 'R2' })];
      const html = renderRecentRaceItems(races);
      const matches = html.match(/recent-race-item/g);
      expect(matches).toHaveLength(2);
    });
  });

  describe('attachRecentRaceItemHandlers', () => {
    let dropdown: HTMLElement;
    let races: RecentRace[];
    let onSelect: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      races = [
        makeRace({ raceId: 'RACE-A' }),
        makeRace({ raceId: 'RACE-B' }),
        makeRace({ raceId: 'RACE-C' }),
      ];

      dropdown = document.createElement('div');
      dropdown.innerHTML = renderRecentRaceItems(races);
      document.body.appendChild(dropdown);

      onSelect = vi.fn();
    });

    afterEach(() => {
      dropdown.remove();
    });

    it('should call onSelect when clicking a race item', () => {
      attachRecentRaceItemHandlers(dropdown, races, onSelect);

      const items = dropdown.querySelectorAll('.recent-race-item');
      (items[0] as HTMLElement).click();

      expect(onSelect).toHaveBeenCalledWith(races[0]);
    });

    it('should call onSelect with the correct race for each item', () => {
      attachRecentRaceItemHandlers(dropdown, races, onSelect);

      const items = dropdown.querySelectorAll('.recent-race-item');
      (items[1] as HTMLElement).click();

      expect(onSelect).toHaveBeenCalledWith(races[1]);
    });

    it('should call onSelect on Enter keydown', () => {
      attachRecentRaceItemHandlers(dropdown, races, onSelect);

      const items = dropdown.querySelectorAll('.recent-race-item');
      const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
      items[0].dispatchEvent(event);

      expect(onSelect).toHaveBeenCalledWith(races[0]);
    });

    it('should call onSelect on Space keydown', () => {
      attachRecentRaceItemHandlers(dropdown, races, onSelect);

      const items = dropdown.querySelectorAll('.recent-race-item');
      const event = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
      items[0].dispatchEvent(event);

      expect(onSelect).toHaveBeenCalledWith(races[0]);
    });

    it('should focus next item on ArrowDown', () => {
      attachRecentRaceItemHandlers(dropdown, races, onSelect);

      const items = dropdown.querySelectorAll('.recent-race-item') as NodeListOf<HTMLElement>;
      const focusSpy = vi.spyOn(items[1], 'focus');

      const event = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true });
      items[0].dispatchEvent(event);

      expect(focusSpy).toHaveBeenCalled();
    });

    it('should not focus past last item on ArrowDown', () => {
      attachRecentRaceItemHandlers(dropdown, races, onSelect);

      const items = dropdown.querySelectorAll('.recent-race-item') as NodeListOf<HTMLElement>;
      // Last item
      const event = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true });
      items[2].dispatchEvent(event);

      // Should not crash or move focus out of bounds
      expect(onSelect).not.toHaveBeenCalled();
    });

    it('should focus previous item on ArrowUp', () => {
      attachRecentRaceItemHandlers(dropdown, races, onSelect);

      const items = dropdown.querySelectorAll('.recent-race-item') as NodeListOf<HTMLElement>;
      const focusSpy = vi.spyOn(items[0], 'focus');

      const event = new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true });
      items[1].dispatchEvent(event);

      expect(focusSpy).toHaveBeenCalled();
    });

    it('should not focus before first item on ArrowUp', () => {
      attachRecentRaceItemHandlers(dropdown, races, onSelect);

      const items = dropdown.querySelectorAll('.recent-race-item') as NodeListOf<HTMLElement>;
      // First item
      const event = new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true });
      items[0].dispatchEvent(event);

      expect(onSelect).not.toHaveBeenCalled();
    });

    it('should hide dropdown on Escape', () => {
      attachRecentRaceItemHandlers(dropdown, races, onSelect);

      const items = dropdown.querySelectorAll('.recent-race-item');
      const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
      items[0].dispatchEvent(event);

      expect(dropdown.style.display).toBe('none');
    });

    it('should prevent default on Enter/Space/Arrow/Escape keys', () => {
      attachRecentRaceItemHandlers(dropdown, races, onSelect);

      const items = dropdown.querySelectorAll('.recent-race-item');
      const keysToTest = ['Enter', ' ', 'ArrowDown', 'ArrowUp', 'Escape'];

      for (const key of keysToTest) {
        const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
        const preventSpy = vi.spyOn(event, 'preventDefault');
        items[1].dispatchEvent(event);
        expect(preventSpy).toHaveBeenCalled();
      }
    });
  });
});
