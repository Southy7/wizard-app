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
        assert page.locator("#screen-setup-summary").is_visible()
        dealer = page.locator("#summary-dealer").text_content()
        starter = page.locator("#summary-starter").text_content()
        assert dealer in ("Anna", "Ben", "Chris")
        assert starter == {"Anna": "Ben", "Ben": "Chris", "Chris": "Anna"}[dealer]
        page.click("#btn-summary-start")
        page.click("#btn-confirm-round-one-hint")

        assert page.locator("#game-round-overview #game-total-points .points-card").count() == 3
        page.locator(".entry-row").nth(0).locator(".value-button").nth(1).click()
        page.locator(".entry-row").nth(1).locator(".value-button").nth(1).click()
        page.click('button:has-text("Ansagen bestätigen")')
        assert page.locator(".bid-overview .score-row.header span").all_text_contents() == [
            "Spieler", "Ansage", "Gesamt"
        ]
        witch = page.locator(".special-button", has_text="Hexe")
        assert witch.is_disabled()
        bomb = page.locator(".special-button", has_text="Bombe")
        bomb.click()
        assert witch.is_enabled()
        bomb.click()
        assert page.locator(".special-button", has_text="Hexe").is_disabled()

        # Mit Wolke und Bombe bietet die Hexe beide möglichen Wiederholungen an.
        page.locator(".special-button", has_text="Wolke").click()
        page.locator("#cloud-player-options button").first.click()
        page.click("#btn-cloud-plus")
        page.locator(".special-button", has_text="Bombe").click()
        page.locator(".special-button", has_text="Hexe").click()
        assert page.locator(".special-button", has_text="2. Wolke").count() == 1
        assert page.locator(".special-button", has_text="2. Bombe").count() == 1
        assert page.get_by_role("button", name="Stiche eintragen").is_disabled()

        # Zweite Bombe und zweite Wolke lassen sich jeweils über denselben Button ein- und ausschalten.
        second_bomb = page.locator(".special-button", has_text="2. Bombe")
        second_bomb.click()
        assert second_bomb.get_attribute("class") and "active" in second_bomb.get_attribute("class")
        second_bomb.click()
        assert page.get_by_role("button", name="Stiche eintragen").is_disabled()

        page.locator(".special-button", has_text="2. Wolke").click()
        page.locator("#cloud-player-options button").first.click()
        page.click("#btn-cloud-plus")
        second_cloud = page.locator(".special-button", has_text="2. Wolke")
        assert "active" in second_cloud.get_attribute("class")
        second_cloud.click()
        assert page.get_by_role("button", name="Stiche eintragen").is_disabled()

        # Hexe sowie die beiden Primärkarten wieder ausschalten.
        page.locator(".special-button", has_text="Hexe").click()
        page.locator(".special-button", has_text="Bombe").click()
        page.locator(".special-button", has_text="Wolke").click()
        assert page.locator("button", has_text="Rückgängig").count() == 0
        assert page.get_by_text("Wolke und Bombe im selben Stich").count() == 0

        page.click('button:has-text("Stiche eintragen")')
        assert page.locator("#game-total-points").is_hidden()
        correct_button = page.locator(".correct-button:not(:disabled)").first
        correct_button.click()
        assert "1" in page.locator(".value-display").all_text_contents()
        page.click('button:has-text("Runde abschließen")')

        assert page.locator(".score-row.header span").all_text_contents() == [
            "Spieler", "Ansage", "Stiche", "Runde", "Gesamt"
        ]
        page.click('button:has-text("Spiel beenden")')
        assert page.locator(".history-table tbody tr").count() == 1

        # Der neue Startseiten-Button öffnet denselben gespeicherten Punkteverlauf.
        page.click("#btn-finished-home")
        assert page.locator("#btn-history").is_enabled()
        page.click("#btn-history")
        assert page.locator("#history-score-content .history-table tbody tr").count() == 1
        browser.close()

    print("Browser-Smoke-Test erfolgreich.")


if __name__ == "__main__":
    main()
