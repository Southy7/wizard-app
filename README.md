# Wizard-Punkte-App – Version 1.0

Leichtgewichtige, responsive Web-App für eure Wizard-Variante mit 70 Karten. Die App läuft ohne Build-Schritt, ohne Benutzerkonto und ohne Serverlogik. Der Spielstand wird lokal im Browser gespeichert.

## Funktionsumfang

### Spieleinrichtung

- neues Spiel und Spiel fortsetzen
- drei bis sechs Spieler
- Spielernamen und Sitzreihenfolge
- Kartengeber in Runde 1
- automatische Bestimmung des Startspielers
- Wizard-Standardrundenzahl als Ausgangswert
- individuelle Rundenzahl bis zum Kartenmaximum bei 70 Karten

### Vollständiger Spielablauf

- Kartengeber und Startspieler für jede Runde
- einmaliger Stirnkarten-Hinweis in Runde 1
- Ansagen in der Reihenfolge ab dem Startspieler
- sichtbare aktuelle Gesamtpunktzahl jedes Spielers während der Ansage
- Sperre, wenn Ansagesumme und Rundennummer identisch sind
- Wolke mit Änderung um −1 oder +1
- Bombe mit angepasster Stichsumme
- Hexe mit genau einer zweiten Wolke oder zweiten Bombe
- Wolke und Bombe im selben Stich
- Eingabe der endgültigen Stiche
- automatische Stichsummenprüfung
- automatische Punkteberechnung
- Rundenergebnis mit Rundenpunkten und aktueller Gesamtpunktzahl in getrennten Spalten
- Bearbeitung der zuletzt abgeschlossenen Runde
- automatische Vorbereitung der nächsten Runde

### Endergebnis

- Gewinner oder Gleichstand
- vollständige Rangliste
- Punktzahl aller Spieler
- Punkteverlauf über sämtliche Runden
- Gesamtzeile am Ende der Rundentabelle

### Sicherheit und Datensicherung

- Sicherheitsabfrage vor dem Überschreiben eines vorhandenen Spiels
- Sicherheitsabfrage vor dem vollständigen Löschen
- verständliche Warnung bei nicht verfügbarem oder beschädigtem Browser-Speicher
- Daten- und Schema-Version im Spielstand
- Export des Spielstands als JSON-Datei
- Import einer exportierten JSON-Datei
- Größen- und Formatprüfung beim Import
- Sicherheitsabfrage vor dem Ersetzen eines vorhandenen Spielstands durch einen Import
- automatische Speicherung nach relevanten Änderungen
- Anfrage an unterstützte Browser, die lokalen Daten dauerhaft zu speichern

### Technik

- HTML, CSS und JavaScript ohne Framework
- keine externen Bibliotheken
- kein Build-Prozess
- responsive Darstellung für Handy und Tablet
- große Touch-Ziele
- Unterstützung für Hoch- und Querformat
- automatischer Hell- und Dunkelmodus
- PWA-Manifest und Offline-Cache

## Lokal starten

Für Installation und Offlinefunktion muss die App über einen lokalen Webserver oder HTTPS geöffnet werden.

### Python

Im Projektordner:

```bash
python -m http.server 8080
```

Unter Windows alternativ:

```bash
py -m http.server 8080
```

Danach öffnen:

```text
http://localhost:8080
```

## Tests

Die App selbst benötigt Node.js nicht. Für die automatisierten Logik- und Speichertests:

```bash
npm test
```

Optional liegt unter `tests/browser-smoke.py` ein Browser-Smoke-Test. Dieser benötigt Python, Playwright und Chromium.

## Export und Import

Auf der Startseite befindet sich der Bereich **Sicherung und Verwaltung**.

- **Spielstand exportieren** lädt den aktuellen Spielstand als JSON-Datei herunter.
- **Spielstand importieren** liest eine zuvor exportierte JSON-Datei ein.
- **Gespeichertes Spiel löschen** entfernt den lokalen Spielstand nach Bestätigung.

Die JSON-Datei enthält nur Spielinformationen wie Namen, Runden, Ansagen, Sonderkarten, Stiche und Punkte. Sie wird nicht automatisch an einen Server übertragen.

## Speicherung

Der aktive Spielstand liegt in `localStorage`. Er bleibt normalerweise nach dem Schließen des Browsers erhalten. Folgende Fälle können trotzdem zum Datenverlust führen:

- manuelles Löschen der Browserdaten
- private Browsermodi
- restriktive Browser- oder Geräteeinstellungen
- Wechsel zu einem anderen Browser oder Gerät

Deshalb empfiehlt sich bei längeren Partien oder vor einem Gerätewechsel ein Export.

## Projektstruktur

```text
wizard-punkte-app-v1.0-step3/
├── index.html
├── styles.css
├── manifest.webmanifest
├── service-worker.js
├── package.json
├── README.md
├── js/
│   ├── app.js
│   ├── game-logic.js
│   └── storage.js
├── tests/
│   ├── browser-smoke.py
│   ├── game-logic.test.js
│   └── storage.test.js
└── assets/
    └── icons/
        ├── icon-192.png
        ├── icon-512.png
        └── icon-maskable-512.png
```
