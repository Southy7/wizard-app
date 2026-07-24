"""Optionaler Browser-Smoke-Test.

Benötigt Python, Playwright und einen Chromium-Browser. Die App selbst benötigt
keine dieser Abhängigkeiten. Der Test lädt die Dateien inline, legt eine kurze
Partie an und prüft Ansagen, Gesamtpunkte, Rundenergebnis und Endtabelle.
"""

from pathlib import Path
import shutil
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]


def build_inline_document() -> str:
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    css = (ROOT / "styles.css").read_text(encoding="utf-8")
    html = html.replace('<link rel="stylesheet" href="styles.css">', f"<style>{css}</style>")
    for script in (
        '<script defer src="js/game-logic.js"></script>',
        '<script defer src="js/storage.js"></script>',
        '<script defer src="js/app.js"></script>',
    ):
        html = html.replace(script, "")
    return html


def main() -> None:
    html = build_inline_document()
    scripts = [
        (ROOT / "js/game-logic.js").read_text(encoding="utf-8"),
        (ROOT / "js/storage.js").read_text(encoding="utf-8"),
        (ROOT / "js/app.js").read_text(encoding="utf-8"),
    ]

    with sync_playwright() as playwright:
        launch_options = {"headless": True}
        chromium_path = shutil.which("chromium") or shutil.which("chromium-browser")
        if chromium_path:
            launch_options["executable_path"] = chromium_path
            launch_options["args"] = ["--no-sandbox"]
        browser = playwright.chromium.launch(**launch_options)
        page = browser.new_page(viewport={"width": 390, "height": 844})
        page.set_content(html)
        page.evaluate(
            """
            (() => {
              const data = new Map();
              Object.defineProperty(window, 'localStorage', {
                configurable: true,
                value: {
                  setItem(key, value) { data.set(String(key), String(value)); },
                  getItem(key) { return data.has(String(key)) ? data.get(String(key)) : null; },
                  removeItem(key) { data.delete(String(key)); },
                  clear() { data.clear(); }
                }
              });
              window.scrollTo = () => {};
            })();
            """
        )
        for script in scripts:
            page.add_script_tag(content=script)
        page.evaluate("document.dispatchEvent(new Event('DOMContentLoaded'))")

        page.click("#btn-new-game")
        for index, name in enumerate(("Anna", "Ben", "Chris")):
            page.locator("#player-list .text-input").nth(index).fill(name)
        page.fill("#rounds-input", "1")
        page.dispatch_event("#rounds-input", "change")
        page.click("#setup-form button[type=submit]")
        page.click("#btn-confirm-round-one-hint")

        assert page.locator(".entry-total").count() == 3
        page.click('button:has-text("Ansagen bestätigen")')
        page.click('button:has-text("Stiche eintragen")')
        page.locator(".entry-row").first.locator(".value-button").nth(1).click()
        page.click('button:has-text("Runde abschließen")')

        assert page.locator(".score-row.header span").all_text_contents() == [
            "Spieler", "Ansage", "Stiche", "Runde", "Gesamt"
        ]
        page.click('button:has-text("Spiel beenden")')
        assert page.locator(".history-table tbody tr").count() == 1
        browser.close()

    print("Browser-Smoke-Test erfolgreich.")


if __name__ == "__main__":
    main()
