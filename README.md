# Wizard-Punkte-App – Version 1.0

Leichtgewichtige, responsive Web-App für eure Wizard-Variante mit 70 Karten. Die App läuft ohne Build-Schritt, ohne Benutzerkonto und ohne Serverlogik. Der Spielstand wird lokal im Browser gespeichert.

## Funktionsumfang

### Spieleinrichtung

- reduzierte Startseite mit neuem Spiel, Fortsetzen, History und Import
- drei bis sechs Spieler
- Spielernamen und Sitzreihenfolge
- zufällige Bestimmung des Kartengebers auf der Zusammenfassungsseite
- automatische Ableitung des Startspielers aus dem zufälligen Kartengeber
- Wizard-Standardrundenzahl als Ausgangswert
- individuelle Rundenzahl bis zum Kartenmaximum bei 70 Karten
- separate Zusammenfassung mit Zurück- und Spiel-starten-Aktion

### Vollständiger Spielablauf

- Kartengeber und Startspieler für jede Runde
- einmaliger Stirnkarten-Hinweis in Runde 1
- Ansagen in der Reihenfolge ab dem Startspieler
- gemeinsame Übersicht für Kartengeber, Startspieler und Gesamtpunkte während der Ansagen
- aktuelle Ansagen und Gesamtpunktzahlen gemeinsam in der Sonderkartenphase
- Sperre, wenn Ansagesumme und Rundennummer identisch sind
- Wolke mit Änderung um −1 oder +1
- Bombe mit angepasster Stichsumme
- Wolke, Bombe und Hexe als direkt umschaltbare Karten
- Hexe erst nach einer Wolke oder Bombe, anschließend mit genau einer umschaltbaren Wiederholung
- gesperrte Sticheingabe, solange bei aktiver Hexe keine zweite Karte gewählt wurde
- Eingabe der endgültigen Stiche
- „Richtig“-Schnellaktion zum Übernehmen der aktuellen Ansage als Stichzahl
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
- verständliche Warnung bei nicht verfügbarem oder beschädigtem Browser-Speicher
- strikte Validierung aktiver lokaler Spielstände vor dem Laden und Darstellen
- keine automatische Reparatur mehrdeutiger Spieler-IDs oder Rundennummern
- unabhängige Fehlerzustände für aktiven Spielstand und History
- Konfliktschutz und sichtbare Warnung bei Änderungen aus einem anderen Browser-Tab
- Daten- und Schema-Version im Spielstand
- Import einer exportierten JSON-Datei
- Größen- und Formatprüfung beim Import
- Sicherheitsabfrage vor dem Ersetzen eines vorhandenen Spielstands durch einen Import
- automatische Speicherung nach relevanten Änderungen
- Anfrage an unterstützte Browser, die lokalen Daten dauerhaft zu speichern

### Technik

- HTML, CSS und JavaScript ohne Framework
- keine externen Bibliotheken
- kein Build-Prozess
- getrennte Module für Spiellogik, Zustandsverwaltung, Speicherung, History und Ergebnisdarstellung
- eigene Controller für Spieleinrichtung und Persistenzkonflikte
- optionales History-Modul; die Kernanwendung bleibt ohne History funktionsfähig
- responsive Darstellung für Handy und Tablet
- große Touch-Ziele
- Unterstützung für Hoch- und Querformat
- automatischer Hell- und Dunkelmodus
- PWA-Manifest und Offline-Cache
- Offline-Cache ausschließlich für den eigenen App-Scope und die feste App-Shell

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

Die App selbst benötigt Node.js nicht. Für die Tests werden Node.js 24 sowie Python 3.13 verwendet. Die Python-Abhängigkeiten und der zugehörige Chromium-Browser werden einmalig installiert:

```bash
python -m pip install -r requirements-test.txt
python -m playwright install chromium
```

Unter Linux kann Playwright die benötigten Systembibliotheken mitinstallieren:

```bash
python -m playwright install --with-deps chromium
```

Danach führt die vollständige Testsuite Unit- und Browser-Tests gemeinsam aus:

```bash
npm test
```

Einzelne Testgruppen lassen sich separat starten:

```bash
npm run test:unit
npm run test:browser
npm run test:browser:core
npm run test:browser:persistence
npm run test:browser:rounds
npm run test:browser:multitab
npm run test:browser:offline
```

Die fokussierten Browser-Szenarien starten einen echten lokalen HTTP-Server. Dadurch
verwenden Reload-, Mehr-Tab- und Offline-Tests natives `localStorage` und einen
tatsächlich installierten Service Worker. Playwright ist in
`requirements-test.txt` fest versioniert. Die GitHub-Actions-Konfiguration führt
`npm test` zusätzlich bei jedem Push und Pull Request in einer reproduzierbaren
Umgebung aus.

## History und Import

Die reduzierte Startseite bietet direkten Zugriff auf den Spielverlauf und den Import:

- **History** listet alle lokal archivierten, abgeschlossenen Partien auf. Ein Klick öffnet das jeweilige Endergebnis mit Rangliste und Punkteverlauf.
- Einzelne Partien sowie das gesamte Archiv können als JSON-Datei exportiert werden.
- Archivdateien lassen sich wieder importieren. Dabei werden Partien anhand ihrer `gameId` zusammengeführt; neuere vorhandene Fassungen werden nicht durch ältere überschrieben.
- Einzelne Partien oder die gesamte History können nach einer Sicherheitsabfrage gelöscht werden.
- **Import** erkennt sowohl einzelne Spielstände als auch vollständige History-Archive.

Die JSON-Datei enthält nur Spielinformationen wie Namen, Runden, Ansagen, Sonderkarten, Stiche und Punkte. Sie wird nicht automatisch an einen Server übertragen.

## Speicherung

Der aktive Spielstand und das getrennte Archiv abgeschlossener Partien liegen in `localStorage`. Sie bleiben normalerweise nach dem Schließen des Browsers erhalten. Folgende Fälle können trotzdem zum Datenverlust führen:

- manuelles Löschen der Browserdaten
- private Browsermodi
- restriktive Browser- oder Geräteeinstellungen
- Wechsel zu einem anderen Browser oder Gerät

Deshalb empfiehlt sich bei längeren Partien oder vor einem Gerätewechsel ein Export.

Ab 100 archivierten Partien oder ungefähr 3 MB Archivgröße zeigt die App eine Warnung an. Es werden keine Partien automatisch gelöscht. Ist das Browserkontingent erschöpft, bleibt der aktive Spielstand erhalten und die App fordert zum Exportieren oder Löschen älterer Partien auf.

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
│   ├── history-controller.js
│   ├── persistence-controller.js
│   ├── result-view.js
│   ├── setup-controller.js
│   ├── state-manager.js
│   ├── storage.js
│   └── ui-components.js
├── tests/
│   ├── browser_helpers.py
│   ├── browser-smoke.py
│   ├── browser-core-without-history.py
│   ├── browser-persistence.py
│   ├── browser-round-flow.py
│   ├── browser-multitab.py
│   ├── browser-offline.py
│   ├── game-logic.test.js
│   ├── service-worker.test.js
│   ├── state-manager.test.js
│   └── storage.test.js
└── assets/
    └── icons/
        ├── icon-192.png
        ├── icon-512.png
        └── icon-maskable-512.png
```
