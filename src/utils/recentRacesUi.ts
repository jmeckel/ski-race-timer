import { t } from '../i18n/translations';
import { store } from '../store';
import { escapeAttr, escapeHtml } from './format';
import type { RecentRace } from './recentRaces';

export function renderRecentRaceItem(race: RecentRace): string {
  const lang = store.getState().currentLang;
  const entryText =
    race.entryCount !== undefined
      ? `${race.entryCount} ${t('entries', lang)}`
      : '';
  const safeRaceId = escapeHtml(race.raceId);
  const attrRaceId = escapeAttr(race.raceId);
  return `
    <div class="recent-race-item" data-race-id="${attrRaceId}" tabindex="0" role="option" aria-label="${escapeAttr(t('race', lang))} ${safeRaceId}${entryText ? `, ${entryText}` : ''}">
      <span class="recent-race-id">${safeRaceId}</span>
      <span class="recent-race-meta">${entryText}</span>
    </div>
  `;
}

export function renderRecentRaceItems(races: RecentRace[]): string {
  return races.map(renderRecentRaceItem).join('');
}

export function attachRecentRaceItemHandlers(
  dropdown: HTMLElement,
  races: RecentRace[],
  onSelect: (race: RecentRace) => void,
): void {
  const items = dropdown.querySelectorAll('.recent-race-item');
  items.forEach((item, index) => {
    item.addEventListener('click', () => {
      const race = races[index];
      if (race) {
        onSelect(race);
      }
    });

    // Keyboard support: Enter/Space to select, arrow keys to navigate
    item.addEventListener('keydown', (e) => {
      const event = e as KeyboardEvent;
      const itemsArray = Array.from(items) as HTMLElement[];

      switch (event.key) {
        case 'Enter':
        case ' ': {
          event.preventDefault();
          const race = races[index];
          if (race) {
            onSelect(race);
          }
          break;
        }
        case 'ArrowDown':
          event.preventDefault();
          if (index < itemsArray.length - 1) {
            itemsArray[index + 1].focus();
          }
          break;
        case 'ArrowUp':
          event.preventDefault();
          if (index > 0) {
            itemsArray[index - 1].focus();
          }
          break;
        case 'Escape':
          event.preventDefault();
          dropdown.style.display = 'none';
          break;
      }
    });
  });
}
