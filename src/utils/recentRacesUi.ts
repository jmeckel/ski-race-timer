import type { RecentRace } from './recentRaces';
import { escapeHtml } from './format';

export function renderRecentRaceItem(race: RecentRace): string {
  const entryText = race.entryCount !== undefined ? `${race.entryCount} entries` : '';
  const safeRaceId = escapeHtml(race.raceId);
  return `
    <div class="recent-race-item" data-race-id="${safeRaceId}">
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
  onSelect: (race: RecentRace) => void
): void {
  dropdown.querySelectorAll('.recent-race-item').forEach((item, index) => {
    item.addEventListener('click', () => {
      const race = races[index];
      if (race) {
        onSelect(race);
      }
    });
  });
}
