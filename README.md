# Wizard Scoreboard

A responsive, installable scoreboard for the 70-card Wizard anniversary edition.
It runs entirely in the browser, works offline, and keeps game data on the device.

## Highlights

- Complete flow for 3-6 players, from seating order and bids to the final ranking
- Automatic dealer rotation, starting-player order, trick validation, and scoring
- Integrated handling for Cloud, Bomb, and Witch effects
- Compact in-app reference for all ten anniversary-edition special cards
- Local game history with JSON import, export, and damaged-archive recovery
- Offline-ready PWA with responsive layouts for phones, tablets, and desktops
- Protection against invalid imports, storage failures, and conflicting browser tabs

## Getting started

No build step or backend is required. Serve the repository through any local HTTP
server:

```bash
python -m http.server 8080
```

Then open [http://localhost:8080](http://localhost:8080).

> A local server or HTTPS is required for installation and offline support.

## Deployment archive

Create a compact deployment ZIP without Git metadata, tests, or examples:

```bash
git status --short
git archive --format=zip --output wizard-scoreboard.zip HEAD
```

Proceed only when `git status --short` produces no output.
Use an atomic release switch when the hosting platform supports it. When uploading
an extracted archive manually, publish `service-worker.js` last so the new worker
installs only after its complete app shell is available.

## Testing

The test suite requires Node.js, Python, and Playwright:

```bash
npm ci
python -m pip install -r requirements-test.txt
python -m playwright install chromium
npm test
```

Run only the faster core suite during development:

```bash
npm run test:core
```

Run linting, formatting validation, JavaScript type checks, and the complete test
suite before a release:

```bash
npm run check
```

## Architecture

| Area                                      | Responsibility                                                |
| ----------------------------------------- | ------------------------------------------------------------- |
| `js/game-logic.js`                        | Game rules, validation, rotation, and scoring                 |
| `js/storage.js`                           | Local persistence, history, imports, and conflict-safe writes |
| `js/file-utils.js` and `js/formatters.js` | Shared downloads and display formatting                       |
| `js/*-controller.js`                      | Setup, rounds, special cards, history, and recovery flows     |
| `js/*-view.js`                            | Scoreboards, round results, rankings, and score history       |
| `styles.css` and `css/`                   | Shared design system and responsive feature styles            |
| `service-worker.js`                       | App-shell updates and offline availability                    |

The application uses framework-free HTML, CSS, and JavaScript. It has no runtime
dependencies, backend, accounts, analytics, or automatic transfer of game data.

## Data and privacy

Active games and completed-game history are stored in `localStorage`. Data remains
on the current browser and device unless it is explicitly exported as JSON.
Export important games before clearing browser data or switching devices.
