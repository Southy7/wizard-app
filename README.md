# Wizard Scoreboard – Version 1.0

A lightweight, responsive web app for a 70-card Wizard variant. It runs without a build step, user accounts, or server-side logic. Game data is stored locally in the browser.

## Features

### Game setup

- Focused home screen with New Game, Continue Game, History, and Import
- Three to six players
- Editable player names and seating order
- Random dealer selection on the summary screen
- Automatic starting-player selection based on the dealer
- Standard Wizard round count selected by default
- Custom round count up to the 70-card maximum
- Separate summary screen with Back and Start Game actions

### Complete game flow

- Dealer and starting player for every round
- One-time forehead-card reminder in round 1
- Bids entered in starting-player order
- Combined dealer, starting-player, and total-score overview during bidding
- Current bids and total scores shown during the special-card phase
- Validation when the bid total equals the round number
- Cloud adjustments of −1 or +1
- Bomb with an adjusted expected trick total
- Cloud, Bomb, and Witch cards can be toggled directly
- Witch becomes available after a Cloud or Bomb and permits exactly one matching second effect
- Trick entry remains locked until an active Witch has a second card selected
- Final trick entry for every player
- Correct shortcut that copies the current bid to the trick count
- Automatic trick-total validation and score calculation
- Round result with separate round-score and total-score columns
- Editing of the most recently completed round
- Automatic preparation of the next round

### Final result

- Winner or tie handling
- Complete ranking and every player's score
- Score history across all rounds
- Total row at the end of the score table

### Data safety

- Confirmation before replacing an existing game
- Clear warnings when browser storage is unavailable or corrupted
- Strict validation before a local game is loaded or displayed
- No automatic repair of ambiguous player IDs or round numbers
- Separate error states for the active game and history
- Conflict protection and visible warnings for changes made in another browser tab
- Data and schema versions in every game state
- JSON import and export
- Import size and format validation
- Automatic saving after relevant changes
- Persistent-storage request in supported browsers

### Technology

- Framework-free HTML, CSS, and JavaScript
- No external runtime libraries or build process
- Separate modules for game logic, state management, storage, history, and result rendering
- Dedicated controllers for game setup and persistence conflicts
- Optional history module; the core app still starts when history is unavailable
- Responsive phone and tablet layouts with large touch targets
- Portrait and landscape support
- Automatic light and dark themes
- PWA manifest and offline cache
- Offline caching restricted to the app's own scope and fixed app shell

## Run locally

Installation and offline support require a local web server or HTTPS.

From the project directory, run:

```bash
python -m http.server 8080
```

On Windows, you can alternatively run:

```bash
py -m http.server 8080
```

Then open:

```text
http://localhost:8080
```

## Tests

The app itself does not require Node.js. The tests use Node.js 24 and Python 3.13. Install the Python dependencies and Chromium once:

```bash
python -m pip install -r requirements-test.txt
python -m playwright install chromium
```

On Linux, Playwright can install the required system libraries as well:

```bash
python -m playwright install --with-deps chromium
```

Run the complete unit and browser test suite:

```bash
npm test
```

Run individual groups:

```bash
npm run test:unit
npm run test:browser
npm run test:browser:core
npm run test:browser:persistence
npm run test:browser:rounds
npm run test:browser:multitab
npm run test:browser:offline
```

The focused browser scenarios start a real local HTTP server. Reload, multi-tab, and offline tests therefore use native `localStorage` and an installed service worker. Playwright is pinned in `requirements-test.txt`. GitHub Actions also runs `npm test` for every push and pull request in a reproducible environment.

## History and import

The home screen provides direct access to the game archive and import:

- **History** lists every locally archived completed game. Selecting a game opens its final ranking and score history.
- Individual games and the entire archive can be exported as JSON.
- Archive files can be imported again. Games are merged by `gameId`; an older import never overwrites a newer stored version.
- Individual games or the complete history can be deleted after confirmation.
- **Import** accepts individual game states and complete history archives.

Exported JSON contains only game information such as names, rounds, bids, special cards, tricks, and points. It is never sent to a server automatically.

## Storage

The active game and the separate completed-game archive are stored in `localStorage`. They normally remain after the browser is closed, but data can still be lost through:

- Manual deletion of browser data
- Private browsing modes
- Restrictive browser or device settings
- Switching to another browser or device

Export longer games and create a backup before changing devices.

The app displays a warning at 100 archived games or about 3 MB of archive data. Games are never deleted automatically. If the browser quota is exhausted, the active game remains intact and the app asks the user to export or delete older archived games.

## Project structure

```text
wizard-app/
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
