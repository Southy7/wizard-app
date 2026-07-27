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
        '<script defer src="js/state-manager.js"></script>',
        '<script defer src="js/storage.js"></script>',
        '<script defer src="js/app.js"></script>',
    ):
        html = html.replace(script, "")
    return html


def main() -> None:
    html = build_inline_document()
    scripts = [
        (ROOT / "js/game-logic.js").read_text(encoding="utf-8"),
        (ROOT / "js/state-manager.js").read_text(encoding="utf-8"),
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
        page.evaluate(
            """localStorage.setItem("wizard-punkte-app:game-state:v1", "{invalid-json")"""
        )
        page.evaluate("document.dispatchEvent(new Event('DOMContentLoaded'))")

        assert page.locator("#storage-warning").is_visible()
        assert "beschädigt" in page.locator("#storage-warning").text_content()

        new_game_box = page.locator("#btn-new-game").bounding_box()
        secondary_row_box = page.locator(".home-secondary-actions").bounding_box()
        history_box = page.locator("#btn-history").bounding_box()
        import_box = page.locator("#btn-import-game").bounding_box()
        assert new_game_box and secondary_row_box and history_box and import_box
        assert abs(history_box["width"] - import_box["width"]) < 1
        assert abs(history_box["y"] - import_box["y"]) < 1
        assert abs(new_game_box["width"] - secondary_row_box["width"]) < 1

        page.evaluate("localStorage.clear()")
        page.click("#btn-new-game")
        assert page.locator("#storage-warning").is_hidden()
        page.evaluate(
            """
            window.dispatchEvent(new StorageEvent("storage", {
              key: WizardStorage.STORAGE_KEY,
              newValue: "{}",
              storageArea: localStorage
            }))
            """
        )
        assert page.locator("#storage-warning").is_visible()
        assert "anderen Tab" in page.locator("#storage-warning").text_content()
        assert page.locator("#screen-setup").is_visible()
        assert page.locator("#screen-setup h2").count() == 0
        assert page.get_by_text("Die Reihenfolge entspricht der Sitzordnung am Tisch.").count() == 0
        assert page.get_by_text("Wizard-Standard:").count() == 0
        assert page.get_by_text("Maximum mit 70 Karten:").count() == 0
        assert page.locator("#btn-setup-home").get_attribute("aria-label") == "Zur Startseite"
        assert page.locator("#player-list label").count() == 0
        assert page.locator("#btn-round-mode-full").get_attribute("aria-checked") == "true"
        assert page.locator("#btn-round-mode-full").text_content().strip() == "Full Game (20 Runden)"
        assert page.locator("#btn-round-mode-individual").get_attribute("aria-checked") == "false"
        assert page.locator("#custom-round-controls").is_hidden()
        assert page.locator("#rounds-input").get_attribute("max") == "23"
        page.click("#btn-round-mode-individual")
        assert page.locator("#custom-round-controls").is_visible()
        assert page.locator("#btn-round-mode-individual").get_attribute("aria-checked") == "true"
        for index, name in enumerate(("Anna", "Ben", "Chris")):
            assert page.locator("#player-list .text-input").nth(index).get_attribute("placeholder") == f"Spieler {index + 1}"
            page.locator("#player-list .text-input").nth(index).fill(name)
        page.fill("#rounds-input", "1")
        page.dispatch_event("#rounds-input", "change")
        page.click("#setup-form button[type=submit]")
        assert page.locator("#screen-setup-summary").is_visible()
        assert page.locator("#summary-dealer").count() == 0
        assert page.locator("#summary-starter").count() == 0
        seat_rows = page.locator("#summary-seat-order .seat-order-item")
        assert seat_rows.count() == 3
        assert page.locator("#summary-seat-order .seat-position").all_text_contents() == ["1", "2", "3"]
        assert page.locator("#summary-seat-order .seat-player-name").all_text_contents() == ["Anna", "Ben", "Chris"]
        assert page.locator("#summary-seat-order .seat-role-badge.dealer").count() == 1
        assert page.locator("#summary-seat-order .seat-role-badge.starter").count() == 1
        dealer = page.locator(".seat-role-badge.dealer").locator("xpath=..").locator("xpath=..").locator(".seat-player-name").text_content()
        starter = page.locator(".seat-role-badge.starter").locator("xpath=..").locator("xpath=..").locator(".seat-player-name").text_content()
        assert dealer in ("Anna", "Ben", "Chris")
        assert starter == {"Anna": "Ben", "Ben": "Chris", "Chris": "Anna"}[dealer]
        assert dealer in page.locator("#summary-seat-order .seat-order-item", has=page.locator(".dealer")).text_content()
        assert starter in page.locator("#summary-seat-order .seat-order-item", has=page.locator(".starter")).text_content()
        page.click("#btn-summary-start")
        page.click("#btn-confirm-round-one-hint")

        assert page.locator("#game-phase-label").text_content() == "Ansagen"
        assert page.locator("#game-title").text_content() == "Runde 1 von 1"
        assert page.locator("#btn-game-home").get_attribute("aria-label") == "Zur Startseite"
        assert page.locator("#btn-game-home").text_content().strip() == ""
        assert page.get_by_text("Aktuelle Gesamtpunktzahl").count() == 0
        assert page.get_by_text("Die Eingabe beginnt beim Startspieler.").count() == 0
        assert page.get_by_text("Beginnt mit der Ansage").count() == 0
        assert page.locator("#game-dealer").count() == 0
        assert page.locator("#game-starter").count() == 0
        assert page.locator("#game-content h3").count() == 0
        assert page.locator("#game-round-overview #game-total-points .points-card").count() == 3
        assert page.locator(".bid-panel .entry-role-badges .dealer").count() == 1
        assert page.locator(".bid-panel .entry-role-badges .starter").count() == 1
        bid_dealer = page.locator(".bid-panel .dealer").locator("xpath=../..").locator(".entry-name").text_content()
        bid_starter = page.locator(".bid-panel .starter").locator("xpath=../..").locator(".entry-name").text_content()
        assert bid_dealer == dealer
        assert bid_starter == starter
        starter_row = page.locator(".bid-panel .starter").locator("xpath=../..")
        starter_name_box = starter_row.locator(".entry-name").bounding_box()
        starter_badge_box = starter_row.locator(".starter").bounding_box()
        assert starter_name_box and starter_badge_box
        assert starter_badge_box["x"] >= starter_name_box["x"] + starter_name_box["width"]
        bid_status = page.locator(".bid-panel .status-card")
        assert bid_status.text_content().strip() == "Summe der Ansagen: 0"
        assert "neutral" in bid_status.get_attribute("class")
        page.locator(".entry-row").nth(0).locator(".value-button").nth(1).click()
        assert bid_status.text_content().strip() == "Summe der Ansagen: 1"
        assert "error" in bid_status.get_attribute("class")
        assert page.get_by_role("button", name="Ansagen bestätigen").is_disabled()
        page.locator(".entry-row").nth(1).locator(".value-button").nth(1).click()
        assert bid_status.text_content().strip() == "Summe der Ansagen: 2"
        assert "neutral" in bid_status.get_attribute("class")
        assert "success" not in bid_status.get_attribute("class")
        assert page.get_by_role("button", name="Ansagen bestätigen").is_enabled()
        page.click('button:has-text("Ansagen bestätigen")')
        assert page.locator("#game-round-overview").is_hidden()
        assert page.get_by_text("Aktuelle Ansagen").count() == 0
        assert page.get_by_text("Nur Wolke, Bombe und Hexe verändern die Punkteverwaltung.").count() == 0
        assert page.locator("#game-content h3").count() == 0
        assert page.get_by_text("auswählen", exact=True).count() == 0
        assert page.get_by_text("erneut klicken zum Entfernen", exact=True).count() == 0
        assert page.locator(".bid-overview .score-row.header span").all_text_contents() == [
            "Spieler", "Ansage", "Gesamt"
        ]
        overview_starter = page.locator(".bid-overview .starter")
        assert overview_starter.count() == 1
        overview_starter_row = overview_starter.locator("xpath=../..")
        assert overview_starter_row.locator(".score-player-name").text_content() == starter
        overview_name_box = overview_starter_row.locator(".score-player-name").bounding_box()
        overview_badge_box = overview_starter.bounding_box()
        assert overview_name_box and overview_badge_box
        assert overview_badge_box["x"] >= overview_name_box["x"] + overview_name_box["width"]
        witch = page.locator(".special-button", has_text="Hexe")
        assert witch.is_disabled()
        bomb = page.locator(".special-button", has_text="Bombe")
        bomb.click()
        assert bomb.get_attribute("aria-pressed") == "true"
        assert "✓" not in bomb.text_content()
        assert witch.is_enabled()
        bomb.click()
        assert page.locator(".special-button", has_text="Hexe").is_disabled()

        # Mit Wolke und Bombe bietet die Hexe beide möglichen Wiederholungen an.
        page.locator(".special-button", has_text="Wolke").click()
        assert page.locator("#cloud-dialog-help").count() == 0
        cloud_heading_box = page.locator("#cloud-dialog .dialog-heading").bounding_box()
        cloud_players_box = page.locator("#cloud-player-options").bounding_box()
        assert cloud_heading_box and cloud_players_box
        assert cloud_players_box["y"] - (cloud_heading_box["y"] + cloud_heading_box["height"]) >= 16
        page.locator("#cloud-player-options button").first.click()
        assert page.get_by_text("hat vor dieser Wolke die Ansage").count() == 0
        page.click("#btn-cloud-plus")
        page.locator(".special-button", has_text="Bombe").click()
        page.locator(".special-button", has_text="Hexe").click()
        assert page.get_by_text("Eingaben prüfen", exact=True).count() == 0
        assert page.locator(".special-button", has_text="2. Wolke").count() == 1
        assert page.locator(".special-button", has_text="2. Bombe").count() == 1
        assert page.locator(".special-button", has_text="2. Wolke").text_content().strip() == "☁ 2. Wolke"
        assert page.locator(".special-button", has_text="2. Bombe").text_content().strip() == "💣 2. Bombe"
        assert page.get_by_role("button", name="Stiche eintragen").is_disabled()
        second_effect_box = page.locator(".second-effect-wrap").bounding_box()
        special_actions_box = page.locator(".special-actions").bounding_box()
        assert second_effect_box and special_actions_box
        assert special_actions_box["y"] - (second_effect_box["y"] + second_effect_box["height"]) >= 16

        # Zweite Bombe und zweite Wolke lassen sich jeweils über denselben Button ein- und ausschalten.
        second_bomb = page.locator(".special-button", has_text="2. Bombe")
        second_bomb.click()
        assert second_bomb.get_attribute("class") and "active" in second_bomb.get_attribute("class")
        assert "✓" not in second_bomb.text_content()
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

        page.click('button:has-text("Stiche eintragen")')
        assert page.locator("#game-round-overview").is_hidden()
        assert page.locator("#game-phase-label").text_content() == "Stiche"
        assert page.locator("#game-content h3").count() == 0
        assert page.get_by_text("Trage für jeden Spieler nur die endgültige Stichzahl dieser Runde ein.").count() == 0
        assert page.locator(".tricks-panel .entry-meta").count() == 0
        trick_status = page.locator(".trick-status")
        assert trick_status.text_content().strip() == "1 Stich fehlt."
        assert trick_status.locator(":scope > *").count() == 1
        trick_list_box = page.locator(".tricks-panel .entry-list").bounding_box()
        trick_status_box = trick_status.bounding_box()
        trick_actions_box = page.locator(".tricks-panel .round-actions").bounding_box()
        assert trick_list_box and trick_status_box and trick_actions_box
        assert trick_status_box["y"] - (trick_list_box["y"] + trick_list_box["height"]) >= 16
        assert trick_actions_box["y"] - (trick_status_box["y"] + trick_status_box["height"]) >= 16
        correct_button = page.locator(".correct-button:not(:disabled)").first
        correct_button_box = correct_button.bounding_box()
        correct_stepper_box = correct_button.locator("xpath=..").locator(".value-stepper").bounding_box()
        assert correct_button_box and correct_stepper_box
        assert correct_button_box["x"] + correct_button_box["width"] <= correct_stepper_box["x"]
        correct_button.click()
        assert "1" in page.locator(".value-display").all_text_contents()
        assert trick_status.text_content().strip() == "Alle Stiche sind vollständig verteilt."
        assert trick_status.locator(":scope > *").count() == 1
        page.click('button:has-text("Runde abschließen")')

        assert page.locator("#game-phase-label").text_content() == "Rundenergebnis"
        assert page.locator("#game-content h3").count() == 0
        assert page.get_by_text("Rundenpunkte und aktuelle Gesamtpunktzahl nach dieser Runde.").count() == 0
        assert page.locator(".score-row.header span").all_text_contents() == [
            "Spieler", "Ansage", "Stiche", "Runde", "Gesamt"
        ]
        result_table_box = page.locator(".round-result-panel .score-table-scroll").bounding_box()
        result_actions_box = page.locator(".round-result-panel .result-actions").bounding_box()
        assert result_table_box and result_actions_box
        assert result_actions_box["y"] - (result_table_box["y"] + result_table_box["height"]) >= 16
        page.click('button:has-text("Spiel beenden")')
        assert page.get_by_text("Partie beendet").count() == 0
        assert page.locator("#winner-summary").count() == 0
        assert page.locator("#final-game-meta").count() == 0
        assert page.get_by_text("Rundenpunkte und abschließende Gesamtpunktzahl aller Spieler.").count() == 0
        assert page.locator("#final-ranking .ranking-position").all_text_contents() == ["🥇", "🥈", "🥉"]
        assert page.locator("#btn-finished-home").get_attribute("aria-label") == "Zur Startseite"
        assert page.locator("#btn-finished-home").text_content().strip() == ""
        assert page.locator(".history-table tbody tr").count() == 1

        # Der neue Startseiten-Button öffnet denselben gespeicherten Punkteverlauf.
        page.click("#btn-finished-home")
        assert page.locator("#btn-history").is_enabled()
        page.click("#btn-history")
        assert page.locator("#history-game-list .history-game-card").count() == 1
        assert page.locator("#history-list-view").is_visible()
        assert page.locator("#history-detail-view").is_hidden()
        page.locator("#history-game-list .history-game-card").click()
        assert page.locator("#history-detail-view").is_visible()
        assert page.locator("#history-detail-ranking .ranking-position").all_text_contents() == ["🥇", "🥈", "🥉"]
        assert page.locator("#history-score-content .history-table tbody tr").count() == 1
        page.click("#btn-history-list-back")
        assert page.locator("#history-list-view").is_visible()
        browser.close()

    print("Browser-Smoke-Test erfolgreich.")


if __name__ == "__main__":
    main()
