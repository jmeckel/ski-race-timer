import { store } from './store';

interface VersionInfo {
  name: string;
  description: {
    en: string;
    de: string;
    fr: string;
  };
}

const VERSION_NAMES: Record<string, VersionInfo> = {
  '5.18': {
    name: 'Powder Streif',
    description: {
      en: 'Battery power saver for longer outdoor timing. Improved PIN security and faster voice notes.',
      de: 'Batterieschoner für längere Zeitmessung im Freien. Verbesserte PIN-Sicherheit und schnellere Sprachnotizen.',
      fr: 'Mode économie de batterie pour un chronométrage prolongé en extérieur. Sécurité PIN améliorée et notes vocales plus rapides.',
    },
  },
  '5.19': {
    name: 'Firn Lauberhorn',
    description: {
      en: 'Under-the-hood reliability upgrade. Stronger server-side input validation and improved code quality.',
      de: 'Verbesserungen unter der Haube. Stärkere serverseitige Eingabevalidierung und verbesserte Codequalität.',
      fr: 'Amélioration de la fiabilité en interne. Validation des entrées côté serveur renforcée et qualité de code améliorée.',
    },
  },
  '5.20': {
    name: 'Corn Saslong',
    description: {
      en: 'Offline banner, undo for deletions, reorganized settings, and standardized event cleanup across the app.',
      de: 'Offline-Banner, Rückgängig-Funktion für Löschungen, neu organisierte Einstellungen und standardisierte Ereignisbereinigung.',
      fr: 'Bannière hors ligne, annulation des suppressions, paramètres réorganisés et nettoyage standardisé des événements.',
    },
  },
  '5.21': {
    name: 'Sleet Kandahar',
    description: {
      en: 'Responsive layout fixes for all screen sizes. Dial and numbers scale smoothly from iPhone SE to iPad landscape.',
      de: 'Responsive Layout-Korrekturen für alle Bildschirmgrößen. Zifferblatt und Zahlen skalieren fließend vom iPhone SE bis iPad Querformat.',
      fr: "Corrections de mise en page responsive pour tous les écrans. Le cadran et les chiffres s'adaptent de l'iPhone SE à l'iPad en mode paysage.",
    },
  },
  '5.22': {
    name: 'Crust Stelvio',
    description: {
      en: 'Signals-based reactivity, view code splitting, reduced-motion support, and 3,700+ new tests for rock-solid reliability.',
      de: 'Signalbasierte Reaktivität, View-Code-Splitting, Reduced-Motion-Unterstützung und 3.700+ neue Tests für maximale Zuverlässigkeit.',
      fr: 'Réactivité basée sur les signaux, découpage du code par vue, support du mouvement réduit et plus de 3 700 nouveaux tests pour une fiabilité maximale.',
    },
  },
  '5.23': {
    name: 'Graupel Hahnenkamm',
    description: {
      en: 'Swipe-to-edit/delete in results, click-outside modal dismiss, auto-bib flash cue, and split settings effects for better performance.',
      de: 'Wischen zum Bearbeiten/Löschen in Ergebnissen, Modal-Schließen per Klick außerhalb, Auto-Bib-Blitz-Hinweis und aufgeteilte Einstellungs-Effekte für bessere Leistung.',
      fr: 'Glisser pour modifier/supprimer dans les résultats, fermeture des modales par clic extérieur, signal flash auto-dossard et effets de paramètres séparés pour de meilleures performances.',
    },
  },
  '5.24': {
    name: 'Névé Planai',
    description: {
      en: 'Full French language support. Three-language UI (DE/FR/EN), French ski racing terminology, and complete documentation in French.',
      de: 'Vollständige französische Sprachunterstützung. Dreisprachige Oberfläche (DE/FR/EN), französische Skirennsport-Terminologie und vollständige Dokumentation auf Französisch.',
      fr: "Support complet de la langue française. Interface trilingue (DE/FR/EN), terminologie du ski de course en français et documentation complète en français.",
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
