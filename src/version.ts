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
