import { store } from './store';

interface VersionInfo {
  name: string;
  description: {
    en: string;
    de: string;
  };
}

const VERSION_NAMES: Record<string, VersionInfo> = {
  '5.18': {
    name: 'Tiramisu Fox',
    description: {
      en: 'Battery power saver for longer outdoor timing. Improved PIN security and faster voice notes.',
      de: 'Batterieschoner für längere Zeitmessung im Freien. Verbesserte PIN-Sicherheit und schnellere Sprachnotizen.',
    },
  },
  '5.19': {
    name: 'Marzipan Lynx',
    description: {
      en: 'Under-the-hood reliability upgrade. Stronger server-side input validation and improved code quality.',
      de: 'Verbesserungen unter der Haube. Stärkere serverseitige Eingabevalidierung und verbesserte Codequalität.',
    },
  },
  '5.20': {
    name: 'Baklava Falcon',
    description: {
      en: 'Offline banner, undo for deletions, reorganized settings, and standardized event cleanup across the app.',
      de: 'Offline-Banner, Rückgängig-Funktion für Löschungen, neu organisierte Einstellungen und standardisierte Ereignisbereinigung.',
    },
  },
  '5.21': {
    name: 'Churros Otter',
    description: {
      en: 'Responsive layout fixes for all screen sizes. Dial and numbers scale smoothly from iPhone SE to iPad landscape.',
      de: 'Responsive Layout-Korrekturen für alle Bildschirmgrößen. Zifferblatt und Zahlen skalieren fließend vom iPhone SE bis iPad Querformat.',
    },
  },
  '5.22': {
    name: 'Pavlova Owl',
    description: {
      en: 'Signals-based reactivity, view code splitting, reduced-motion support, and 3,700+ new tests for rock-solid reliability.',
      de: 'Signalbasierte Reaktivität, View-Code-Splitting, Reduced-Motion-Unterstützung und 3.700+ neue Tests für maximale Zuverlässigkeit.',
    },
  },
};

export function getVersionInfo(
  version: string,
): { name: string; description: string } | null {
  const parts = version.split('.');
  if (parts.length < 2) return null;
  const minorKey = `${parts[0]}.${parts[1]}`;
  const info = VERSION_NAMES[minorKey];
  if (!info) return null;
  const lang = store.getState().currentLang;
  return {
    name: info.name,
    description: info.description[lang] || info.description.en,
  };
}
