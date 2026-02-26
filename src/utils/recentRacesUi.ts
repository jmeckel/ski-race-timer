import { t } from '../i18n/translations';
import { store } from '../store';
import { escapeAttr, escapeHtml } from './format';
import type { RecentRace } from './recentRaces';

// Shared AbortController to remove previous delegation handlers on re-render
let dropdownAbortController: AbortController | null = null;

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
  // Abort previous handlers before adding new ones (races array changes)
  if (dropdownAbortController) {
    dropdownAbortController.abort();
  }
  dropdownAbortController = new AbortController();
  const { signal } = dropdownAbortController;

  // Delegated click handler on stable dropdown container
  dropdown.addEventListener(
    'click',
    (e) => {
      const target = e.target as HTMLElement;
      const item = target.closest('.recent-race-item');
      if (!item) return;
      const raceId = item.getAttribute('data-race-id');
      const race = races.find((r) => r.raceId === raceId);
      if (race) onSelect(race);
    },
    { signal },
  );

  // Delegated keyboard handler
  dropdown.addEventListener(
    'keydown',
    (e) => {
      const target = e.target as HTMLElement;
      const item = target.closest('.recent-race-item') as HTMLElement | null;
      if (!item) return;

      const items = Array.from(
        dropdown.querySelectorAll('.recent-race-item'),
      ) as HTMLElement[];
      const index = items.indexOf(item);

      switch (e.key) {
        case 'Enter':
        case ' ': {
          e.preventDefault();
          const raceId = item.getAttribute('data-race-id');
          const race = races.find((r) => r.raceId === raceId);
          if (race) onSelect(race);
          break;
        }
        case 'ArrowDown':
          e.preventDefault();
          if (index < items.length - 1) {
            items[index + 1]!.focus();
          }
          break;
        case 'ArrowUp':
          e.preventDefault();
          if (index > 0) {
            items[index - 1]!.focus();
          }
          break;
        case 'Escape':
          e.preventDefault();
          dropdown.style.display = 'none';
          break;
      }
    },
    { signal },
  );
}
