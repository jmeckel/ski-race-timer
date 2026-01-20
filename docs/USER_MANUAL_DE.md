# Ski Race Timer - Benutzerhandbuch

**GPS-synchronisierte Zeitmessung für Skirennen**

Version 3.4 | Stand: Januar 2026

---

## Inhaltsverzeichnis

1. [Einführung](#einführung)
2. [Erste Schritte](#erste-schritte)
   - [Ersteinrichtung](#ersteinrichtung)
   - [Als App installieren](#als-app-installieren)
3. [Timer-Ansicht](#timer-ansicht)
   - [Zeiten erfassen](#zeiten-erfassen)
   - [Verwendung des Nummernblocks](#verwendung-des-nummernblocks)
   - [Messpunkte (Start/Ziel)](#messpunkte)
4. [Ergebnis-Ansicht](#ergebnis-ansicht)
   - [Einträge anzeigen](#einträge-anzeigen)
   - [Suchen und Filtern](#suchen-und-filtern)
   - [Einträge bearbeiten](#einträge-bearbeiten)
   - [Einträge löschen](#einträge-löschen)
   - [Ergebnisse exportieren](#ergebnisse-exportieren)
5. [Einstellungen](#einstellungen)
   - [Einfacher Modus vs. Vollmodus](#einfacher-modus-vs-vollmodus)
   - [Cloud-Synchronisation](#cloud-synchronisation)
   - [Fotoaufnahme](#fotoaufnahme)
   - [GPS-Synchronisation](#gps-synchronisation)
   - [Feedback-Optionen](#feedback-optionen)
   - [Sprache](#sprache)
6. [Mehrgeräte-Synchronisation](#mehrgeräte-synchronisation)
   - [Synchronisation einrichten](#synchronisation-einrichten)
   - [Rennverwaltung](#rennverwaltung)
   - [PIN-Schutz](#pin-schutz)
7. [Tipps & Empfehlungen](#tipps--empfehlungen)
8. [Fehlerbehebung](#fehlerbehebung)
9. [Tastaturkürzel](#tastaturkürzel)

---

## Einführung

Ski Race Timer ist eine professionelle Zeitmessungsanwendung für Skirennen und ähnliche Sportveranstaltungen. Sie funktioniert als Progressive Web App (PWA), kann also auf jedem Gerät installiert werden und funktioniert auch offline.

### Hauptfunktionen

- **GPS-synchronisierte Zeitmessung** für präzise, konsistente Zeitstempel über alle Geräte
- **Mehrgeräte-Synchronisation** zur Koordination von Start- und Zielzeitmessung
- **Mehrlauf-Unterstützung** für Rennen mit zwei Durchgängen (z.B. Slalom)
- **Offline-First-Design** - funktioniert ohne Internet, synchronisiert bei Verbindung
- **Fotoaufnahme** - optionale Fotodokumentation für jeden Zeitstempel
- **Export für Race Horology** - branchenübliches CSV-Format
- **Zweisprachig** - Deutsche und englische Benutzeroberfläche

---

## Erste Schritte

### Ersteinrichtung

Beim ersten Öffnen von Ski Race Timer führt Sie ein Einrichtungsassistent durch die Ersteinrichtung:

#### Schritt 1: Willkommen & Sprache
- Wählen Sie Ihre bevorzugte Sprache: **Deutsch** oder **English**
- Diese Einstellung gilt für die gesamte App

#### Schritt 2: Timer benennen
- Geben Sie einen Namen für dieses Gerät ein (z.B. "Start Timer", "Ziel 1")
- Dieser Name identifiziert Ihr Gerät bei der Synchronisation mit anderen
- Ein zufälliger Name wird vorgeschlagen (z.B. "Alpengipfel 42") - tippen Sie auf die Aktualisieren-Schaltfläche für einen neuen
- Sie können auch einen beliebigen eigenen Namen eingeben

#### Schritt 3: Fotodokumentation
- Wählen Sie, ob die automatische Fotoaufnahme aktiviert werden soll
- Wenn aktiviert, wird bei jeder Zeiterfassung ein Foto aufgenommen
- **Warum Fotos verwenden?**
  - Startnummern bei Streitfällen überprüfen
  - Zieleinläufe dokumentieren
  - Beweismaterial für Rennleitung
- Fotoaufnahme ist **standardmäßig deaktiviert** - nur bei Bedarf aktivieren
- Kann später in den Einstellungen geändert werden

#### Schritt 4: Rennen beitreten (Optional)
- **Rennen-ID**: Geben Sie eine eindeutige Kennung für Ihr Rennen ein (z.B. "WINTERCUP-2026")
  - Wenn das Rennen bereits existiert, sehen Sie "Rennen gefunden" mit der Anzahl der Einträge
  - Wenn es neu ist, sehen Sie "Neues Rennen"
  - **Schnellauswahl**: Tippen Sie auf das Uhr-Symbol neben dem Eingabefeld, um heute synchronisierte Rennen anzuzeigen - tippen Sie auf ein Rennen, um die ID automatisch einzutragen
- **PIN**: Geben Sie eine 4-stellige PIN ein, um das Rennen zu sichern
- **Cloud-Sync aktivieren**: Einschalten, um mit anderen Geräten zu synchronisieren
- Sie können diesen Schritt überspringen und später in den Einstellungen konfigurieren

#### Schritt 5: Bereit zur Zeitmessung
- Überprüfen Sie Ihre Konfigurationsübersicht:
  - Gerätename
  - Fotoaufnahme-Status
  - Rennen-ID
  - Cloud-Sync-Status
- Tippen Sie auf **Zeitmessung starten** um zu beginnen

> **Tipp:** Sie können den Einrichtungsassistenten jederzeit über Einstellungen → Tutorial anzeigen wiederholen

### Als App installieren

Ski Race Timer funktioniert am besten, wenn es als App auf Ihrem Gerät installiert ist:

**Auf iOS (iPhone/iPad):**
1. Öffnen Sie die App in Safari
2. Tippen Sie auf die Teilen-Schaltfläche (Quadrat mit Pfeil)
3. Scrollen Sie nach unten und tippen Sie auf "Zum Home-Bildschirm"
4. Tippen Sie auf "Hinzufügen"

**Auf Android:**
1. Öffnen Sie die App in Chrome
2. Tippen Sie auf das Drei-Punkte-Menü
3. Tippen Sie auf "Zum Startbildschirm hinzufügen" oder "App installieren"
4. Bestätigen Sie die Installation

**Vorteile der Installation:**
- Vollbilderfahrung ohne Browser-Oberfläche
- Schnelleres Laden
- Funktioniert komplett offline
- Erscheint in Ihrer App-Liste

---

## Timer-Ansicht

Die Timer-Ansicht ist Ihr Hauptarbeitsbereich für die Erfassung von Rennzeiten.

### Bildschirmaufbau

```
┌─────────────────────────────────┐
│  Ski Race Timer    [Sync] [GPS] │  ← Kopfzeile mit Statusanzeigen
├─────────────────────────────────┤
│                                 │
│         12:34:56.789            │  ← Live-Uhr (aktualisiert jede ms)
│                                 │
│    [Start]     [Ziel]           │  ← Messpunkt-Auswahl
│        [L1] [L2]                │  ← Laufauswahl (Vollmodus)
│                                 │
│    ┌─────────────────────┐      │
│    │    ZEIT ERFASSEN    │      │  ← Große Zeitstempel-Schaltfläche
│    └─────────────────────┘      │
│                                 │
│    Letzte: 042 | L1 | Ziel      │  ← Zuletzt erfasster Eintrag
│                                 │
│         Startnr: 043            │  ← Aktuelle Startnummer
│                                 │
│    ┌───┬───┬───┐               │
│    │ 1 │ 2 │ 3 │               │  ← Nummernblock
│    ├───┼───┼───┤               │
│    │ 4 │ 5 │ 6 │               │
│    ├───┼───┼───┤               │
│    │ 7 │ 8 │ 9 │               │
│    ├───┼───┼───┤               │
│    │ C │ 0 │ ⌫ │               │
│    └───┴───┴───┘               │
├─────────────────────────────────┤
│  [Timer]   [Ergebnisse]  [Einst]│  ← Navigations-Tabs
└─────────────────────────────────┘
```

### Zeiten erfassen

1. **Startnummer eingeben** mit dem Nummernblock
   - Nummern werden 3-stellig angezeigt (z.B. "5" wird zu "005")
   - Maximal 3 Ziffern (000-999)

2. **Messpunkt auswählen**
   - **Start** (grün): Wenn Rennläufer ihren Lauf beginnen
   - **Ziel** (rot): Wenn Rennläufer die Ziellinie überqueren

3. **Auf die große ZEIT ERFASSEN-Schaltfläche tippen**
   - Eine Bestätigungseinblendung zeigt den erfassten Eintrag
   - Der Zeitstempel wird auf Millisekunden genau erfasst

### Verwendung des Nummernblocks

| Taste | Funktion |
|-------|----------|
| 0-9 | Startnummer-Ziffern eingeben |
| C | Gesamte Startnummer löschen |
| ⌫ | Letzte Ziffer löschen |

### Messpunkte

- **Start (S)**: Erfasst, wenn ein Rennläufer das Starttor verlässt
- **Ziel (F)**: Erfasst, wenn ein Rennläufer die Ziellinie überquert

Im **Vollmodus** sind beide Schaltflächen sichtbar. Im **Einfachen Modus** wird nur Ziel angezeigt.

### Laufauswahl

Für Mehrlaufrennen (z.B. Slalom mit zwei Durchgängen) verwenden Sie die Laufauswahl:

- **L1** (Lauf 1): Erster Durchgang des Rennens
- **L2** (Lauf 2): Zweiter Durchgang des Rennens

Die Laufauswahl erscheint nur im **Vollmodus**. Im Einfachen Modus werden alle Einträge als Lauf 1 erfasst.

### Auto-Inkrement

Wenn aktiviert (Standard), erhöht sich die Startnummer automatisch um 1 nach Erfassung einer **Ziel**-Zeit. Dies beschleunigt die Zeitmessung, wenn Rennläufer der Reihe nach ins Ziel kommen.

- Auto-Inkrement wird nur bei Ziel ausgelöst, nicht bei Start
- Wenn Sie eine Startnummer erneut erfassen müssen, geben Sie sie einfach manuell ein

### Duplikaterkennung

Wenn Sie die gleiche Startnummer, den gleichen Messpunkt und den gleichen Lauf zweimal erfassen, erscheint eine **gelbe Warnung**. Der Eintrag wird trotzdem erfasst, aber dies warnt Sie vor möglichen Fehlern. Dieselbe Startnummer kann ohne Warnung für verschiedene Läufe erfasst werden (z.B. Lauf 1 und Lauf 2).

### Null-Startnummer-Warnung

Die Erfassung der Startnummer "000" löst eine Verifizierungswarnung aus, da dies oft ein versehentlicher Eintrag ist.

---

## Ergebnis-Ansicht

Die Ergebnis-Ansicht zeigt alle erfassten Einträge und bietet Werkzeuge zur Verwaltung und zum Export.

### Einträge anzeigen

Einträge werden in einer scrollbaren Liste angezeigt, sortiert nach Zeitstempel (neueste zuerst):

```
┌─────────────────────────────────┐
│  042  │ L1 │  Z  │ 12:34:56.78 │ ✓ │
│  Start Timer                    │
└─────────────────────────────────┘
```

Jeder Eintrag zeigt:
- **Startnummer** (groß, links)
- **Lauf-Indikator** (L1 = Lauf 1, L2 = Lauf 2)
- **Messpunkt** (S = Start, Z = Ziel)
- **Zeitstempel** (HH:MM:SS.ss Format)
- **Sync-Status** (✓ = mit Cloud synchronisiert)
- **Gerätename** (welcher Timer hat erfasst)
- **Foto-Indikator** (Kamera-Symbol, wenn Foto angehängt)

### Statistik-Leiste

Am oberen Rand der Ergebnis-Ansicht:
- **Gesamt**: Anzahl erfasster Einträge
- **Läufer**: Anzahl einzigartiger Startnummern
- **Im Ziel**: Anzahl der Ziel-Einträge (nur im Vollmodus)

### Suchen und Filtern

**Suche nach Startnummer:**
- Geben Sie im Suchfeld ein, um bestimmte Startnummern zu finden
- Findet Teilübereinstimmungen (z.B. "4" findet 004, 014, 040, etc.)

**Nach Messpunkt filtern:**
- Alle / Start / Ziel

**Nach Status filtern:**
- Alle / OK / DNS / DNF / DSQ

### Einträge bearbeiten

1. Tippen Sie auf einen Eintrag, um den Bearbeitungsdialog zu öffnen
2. Sie können ändern:
   - **Startnummer**: Ändern, wenn falsch eingegeben
   - **Lauf**: Zwischen Lauf 1 und Lauf 2 wechseln
   - **Status**: Auf OK, DNS, DNF oder DSQ setzen

3. Tippen Sie auf **Speichern** zur Bestätigung

> **Hinweis:** Zeitstempel oder Messpunkt können nicht bearbeitet werden. Bei Bedarf löschen und neu erfassen.

### Statuscodes

| Code | Bedeutung | Beschreibung |
|------|-----------|--------------|
| OK | Beendet | Normaler Abschluss |
| DNS | Did Not Start | Rennläufer ist nicht gestartet |
| DNF | Did Not Finish | Rennläufer gestartet, aber nicht beendet |
| DSQ | Disqualifiziert | Rennläufer wurde disqualifiziert |

### Einträge löschen

**Einzelner Eintrag:**
1. Auf einem Eintrag nach links wischen, oder
2. Zum Bearbeiten tippen, dann auf das Löschen-Symbol tippen

**Mehrere Einträge:**
1. Lange auf einen Eintrag drücken, um den Auswahlmodus zu aktivieren
2. Auf weitere Einträge tippen, um sie auszuwählen
3. Auf "Ausgewählte löschen" in der erscheinenden Leiste tippen

**Alle Einträge:**
1. Auf die "Alle löschen"-Schaltfläche tippen (Papierkorb-Symbol)
2. Die Löschung bestätigen

> **Warnung:** Löschungen werden mit allen verbundenen Geräten synchronisiert. Andere Timer verlieren diese Einträge ebenfalls.

### Rückgängig machen

Fehler gemacht? Tippen Sie unmittelbar nach dem Löschen auf **Rückgängig**, um Einträge wiederherzustellen.

- Rückgängig funktioniert für die letzte Aktion
- Funktioniert für einzelne Löschungen, mehrere Löschungen und alle löschen
- Stellt auch synchronisierte Einträge auf anderen Geräten wieder her

### Ergebnisse exportieren

Tippen Sie auf die **Export**-Schaltfläche, um eine CSV-Datei herunterzuladen, die mit Race Horology und anderer Zeitmessungssoftware kompatibel ist.

**Export-Format:**
```csv
Startnummer;Lauf;Messpunkt;Zeit;Status;Gerät
042;1;FT;12:34:56.78;OK;Ziel Timer
041;2;ST;12:33:45.12;OK;Start Timer
```

**Spaltendetails:**
| Spalte | Beschreibung |
|--------|--------------|
| Startnummer | Startnummer |
| Lauf | 1 (erster Durchgang) oder 2 (zweiter Durchgang) |
| Messpunkt | ST (Start) oder FT (Ziel) |
| Zeit | Zeit im HH:MM:SS.ss Format |
| Status | OK, DNS, DNF oder DSQ |
| Gerät | Gerätename, der den Eintrag erfasst hat |

---

## Einstellungen

Zugang zu den Einstellungen über das Zahnrad-Symbol in der Navigationsleiste.

### Einfacher Modus vs. Vollmodus

**Einfacher Modus** (Standard):
- Zeigt nur wesentliche Steuerelemente
- Nur Ziel-Messpunkt
- Weniger Einstellungen sichtbar
- Am besten für Einpunkt-Zeitmessung

**Vollmodus**:
- Alle Funktionen sichtbar
- Sowohl Start- als auch Ziel-Messpunkte
- Laufauswahl (Lauf 1/Lauf 2) für Mehrlaufrennen
- Erweiterte Filterung in Ergebnissen
- GPS-Einstellungen sichtbar
- Admin-/Rennverwaltungsoptionen

Umschalten: **Einstellungen → Einfacher Modus**

### Cloud-Synchronisation

Aktivieren Sie die Cloud-Synchronisation, um Einträge zwischen mehreren Geräten zu teilen.

**Einstellungen:**
- **Cloud-Sync**: Hauptschalter für die Sync-Funktionalität
- **Rennen-ID**: Eindeutige Kennung für Ihr Rennen
  - Tippen Sie auf das Uhr-Symbol zur Schnellauswahl kürzlich synchronisierter Rennen
- **Gerätename**: Wie dieses Gerät anderen angezeigt wird
- **Fotos synchronisieren**: Auch aufgenommene Fotos synchronisieren (verbraucht mehr Daten)

Wenn Sync aktiv ist, sehen Sie einen Statusindikator in der Kopfzeile:
- 🟢 **Verbunden**: Echtzeit-Sync aktiv
- 🟡 **Synchronisiert**: Datentransfer läuft
- 🟠 **Offline**: Arbeitet lokal, synchronisiert bei Verbindung
- 🔴 **Fehler**: Sync-Problem (Verbindung prüfen)

### Fotoaufnahme

Wenn aktiviert, nimmt die App bei jeder Zeiterfassung ein Foto auf.

**Anwendungsfälle:**
- Rennläufer an der Ziellinie dokumentieren
- Startnummern verifizieren
- Beweismaterial bei Streitigkeiten

**Einstellungen:**
- **Fotoaufnahme**: Kamera aktivieren/deaktivieren
- **Fotos synchronisieren**: Fotos über Geräte teilen (erfordert Cloud-Sync)

Fotos erscheinen als Miniaturbilder in der Ergebnisliste. Zum Vergrößern tippen.

> **Hinweis:** Fotos unter 500KB werden in die Cloud synchronisiert. Größere Fotos bleiben auf dem lokalen Gerät.

### GPS-Synchronisation

Nutzt das GPS Ihres Geräts zur Verbesserung der Zeitstempel-Genauigkeit und Synchronisation.

Wenn aktiv:
- Zeitstempel verwenden GPS-korrigierte Zeit
- Konsistentere Zeitmessung über Geräte hinweg
- Zeigt Genauigkeitsindikator in der Kopfzeile

**Statusanzeigen:**
- 🟢 **GPS aktiv**: Gutes Signal, hohe Genauigkeit
- 🟡 **Sucht**: Erfasst Satelliten
- 🔴 **Inaktiv**: GPS deaktiviert oder nicht verfügbar

> **Tipp:** Für beste GPS-Genauigkeit die App im Freien mit freier Sicht zum Himmel verwenden.

### Feedback-Optionen

**Haptisches Feedback:**
- Vibration bei Tastendrücken und Bestätigungen
- Hilft, Aktionen zu bestätigen, ohne auf den Bildschirm zu schauen
- Empfohlen für den Außeneinsatz mit Handschuhen

**Sound-Feedback:**
- Akustischer Signalton bei Zeiterfassung
- Bestätigt erfolgreiche Zeiterfassung
- Nützlich in lauten Umgebungen

### Sprache

Wechseln zwischen **Deutsch (DE)** und **English (EN)**.

Alle Oberflächentexte, Meldungen und Exporte werden sofort aktualisiert.

---

## Mehrgeräte-Synchronisation

Ski Race Timer eignet sich hervorragend zur Koordination mehrerer Zeitmessungsgeräte für professionelles Rennmanagement.

### Typischer Aufbau

```
        ┌─────────────────┐
        │   Cloud Sync    │
        │   (Rennen-ID:   │
        │   WINTERCUP-26) │
        └────────┬────────┘
                 │
     ┌───────────┼───────────┐
     │           │           │
     ▼           ▼           ▼
┌─────────┐ ┌─────────┐ ┌─────────┐
│ Start   │ │ Ziel    │ │ Backup  │
│ Timer   │ │ Timer   │ │ Timer   │
│ (iPad)  │ │ (Handy) │ │ (Tablet)│
└─────────┘ └─────────┘ └─────────┘
```

### Synchronisation einrichten

**Auf dem ersten Gerät:**
1. Gehen Sie zu **Einstellungen → Cloud-Sync** (aktivieren)
2. Geben Sie eine **Rennen-ID** ein (z.B. "VEREINS-RENNEN-2026")
3. Legen Sie eine **PIN** fest (4 Ziffern) - diese sichert Ihr Rennen
4. Geben Sie einen beschreibenden **Gerätenamen** ein (z.B. "Starttor")

**Auf weiteren Geräten:**
1. Aktivieren Sie **Cloud-Sync**
2. Geben Sie die **gleiche Rennen-ID** ein
3. Geben Sie die **gleiche PIN** ein
4. Geben Sie jedem Gerät einen eindeutigen Namen (z.B. "Ziellinie")

Alle Geräte mit übereinstimmender Rennen-ID und PIN synchronisieren automatisch.

### Was wird synchronisiert

| Daten | Synchronisiert? |
|-------|-----------------|
| Zeiteinträge | ✓ Ja |
| Eintrag-Bearbeitungen | ✓ Ja |
| Löschungen | ✓ Ja |
| Fotos (wenn aktiviert) | ✓ Ja |
| Einstellungen | ✗ Nein (pro Gerät) |
| Startnummer-Eingabe | ✗ Nein (pro Gerät) |

### Rennverwaltung

Zugang über **Einstellungen → Admin → Rennen verwalten** (nur Vollmodus)

Funktionen:
- Alle aktiven Rennen anzeigen, auf die Sie Zugriff haben
- Eintragsanzahl und verbundene Geräte sehen
- Rennen löschen (löscht alle Einträge von allen Geräten)

### PIN-Schutz

Die 4-stellige PIN:
- Erforderlich, um einem bestehenden Rennen beizutreten
- Verhindert unbefugten Zugriff auf Renndaten
- Gleiche PIN auf allen synchronisierenden Geräten erforderlich

**PIN festlegen/ändern:**
1. Gehen Sie zu **Einstellungen → Admin → Admin-PIN**
2. Geben Sie die aktuelle PIN ein (wenn Sie ändern)
3. Geben Sie eine neue 4-stellige PIN ein
4. Bestätigen Sie die PIN

> **Wichtig:** Wenn Sie die PIN vergessen, können Sie diesem Rennen nicht beitreten. Erstellen Sie ein neues Rennen mit einer neuen ID.

---

## Tipps & Empfehlungen

### Vor dem Renntag

1. **Testen Sie Ihr Setup** mit ein paar Probeläufen
2. **Laden Sie alle Geräte** vollständig auf
3. **Installieren Sie die App** auf allen Geräten (funktioniert besser als im Browser)
4. **Richten Sie die Synchronisation ein** und überprüfen Sie, dass alle Geräte verbinden
5. **Löschen Sie alte Einträge** von vorherigen Veranstaltungen

### Aufbau am Renntag

1. **Positionieren Sie die Geräte** an Start und Ziel
2. **Überprüfen Sie den Sync-Status** - alle Geräte sollten "Verbunden" zeigen
3. **Testen Sie mit einem Vorläufer** - erfassen Sie Zeiten und überprüfen Sie, ob sie auf allen Geräten erscheinen
4. **Vergeben Sie eindeutige Gerätenamen** (Start, Ziel A, Ziel B, etc.)

### Während des Rennens

1. **Halten Sie Geräte geladen** - bringen Sie Powerbanks mit
2. **Überwachen Sie den Sync-Status** - Einträge sollten innerhalb von Sekunden synchronisieren
3. **Nutzen Sie Auto-Inkrement** für aufeinanderfolgende Zieleinläufe
4. **Achten Sie auf Duplikate** - gelbe Warnungen zeigen wiederholte Einträge an
5. **Machen Sie Fotos** bei knappen Zieleinläufen oder Streitfällen

### Nach dem Rennen

1. **Exportieren Sie die Ergebnisse** von einem beliebigen synchronisierten Gerät
2. **Überprüfen Sie, ob die Eintragsanzahl** über alle Geräte übereinstimmt
3. **Sichten Sie die Fotos** bei aufkommenden Streitigkeiten
4. **Löschen Sie die Renndaten** vor der nächsten Veranstaltung

### Offline-Betrieb

Wenn die Internetverbindung unterbrochen wird:
- Erfassen Sie weiterhin normal Zeiten
- Einträge werden lokal gespeichert
- Wenn die Verbindung wiederhergestellt ist, wird alles automatisch synchronisiert
- Keine Daten gehen verloren

---

## Fehlerbehebung

### Synchronisationsprobleme

**Problem: Einträge erscheinen nicht auf anderen Geräten**

Lösungen:
1. Überprüfen Sie, ob alle Geräte die gleiche Rennen-ID haben
2. Überprüfen Sie, ob die PIN auf allen Geräten korrekt ist
3. Überprüfen Sie die Internetverbindung
4. Ziehen Sie in der Ergebnis-Ansicht nach unten, um eine Aktualisierung zu erzwingen
5. Schalten Sie Cloud-Sync aus und wieder ein

**Problem: "Sync-Fehler"-Status**

Lösungen:
1. Überprüfen Sie die Internetverbindung
2. Warten Sie einen Moment und versuchen Sie es erneut (möglicherweise Rate-Limiting)
3. Überprüfen Sie, ob die PIN korrekt ist
4. Schließen Sie die App und öffnen Sie sie erneut

### Kameraprobleme

**Problem: Fotoaufnahme funktioniert nicht**

Lösungen:
1. Erteilen Sie bei Aufforderung die Kamera-Berechtigung
2. Überprüfen Sie, ob Fotoaufnahme in den Einstellungen aktiviert ist
3. Auf iOS sicherstellen, dass die App nicht im "Desktop"-Ansichtsmodus ist
4. Versuchen Sie, die App neu zu laden

### GPS-Probleme

**Problem: GPS aktiviert sich nicht oder geringe Genauigkeit**

Lösungen:
1. Stellen Sie sicher, dass GPS in den Einstellungen aktiviert ist
2. Erteilen Sie bei Aufforderung die Standort-Berechtigung
3. Gehen Sie ins Freie mit freier Sicht zum Himmel
4. Warten Sie 30-60 Sekunden für den Satellitenempfang
5. Manche Geräte haben schlechte GPS-Hardware

### Allgemeine Probleme

**Problem: App lädt nicht oder leerer Bildschirm**

Lösungen:
1. Browser-Cache leeren
2. PWA deinstallieren und neu installieren
3. Einen anderen Browser ausprobieren
4. JavaScript-Fehler in der Browser-Konsole prüfen

**Problem: Fehlerbehebungsdialog erschien**

Wenn mehrere Fehler auftreten, kann ein Wiederherstellungsdialog mit Optionen erscheinen:
- **Schließen**: Dialog schließen und App weiter verwenden
- **Neu laden**: Seite aktualisieren, um App-Zustand zurückzusetzen

Dies passiert typischerweise aufgrund von:
1. Netzwerk-Verbindungsproblemen während der Synchronisation
2. Browser hat wenig Arbeitsspeicher
3. Temporäre Server-Probleme

Ihre Daten sind sicher - die App speichert Einträge lokal, bevor sie synchronisiert werden.

**Problem: Daten scheinen verloren**

Lösungen:
1. Überprüfen Sie, ob Sie die richtige Rennen-ID verwenden
2. Daten könnten auf einem anderen Gerät sein
3. Überprüfen Sie, ob der Browser-LocalStorage nicht gelöscht wurde
4. Wenn synchronisiert, können Daten möglicherweise von einem anderen Gerät wiederhergestellt werden

---

## Tastaturkürzel

Bei Verwendung am Computer oder mit externer Tastatur:

| Kürzel | Aktion |
|--------|--------|
| Enter | Zeitstempel erfassen (wenn in Timer-Ansicht) |
| 0-9 | Startnummer-Ziffern eingeben |
| Rücktaste | Letzte Ziffer löschen |
| Escape | Dialoge schließen |

---

## Support

**Probleme melden:**
https://github.com/jmeckel/ski-race-timer/issues

**Versionsinformation:**
Aktuelle Version in Einstellungen prüfen (unten auf der Seite)

---

*Ski Race Timer - Professionelle Zeitmessung leicht gemacht.*
