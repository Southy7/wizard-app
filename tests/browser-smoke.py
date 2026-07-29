"""Optional browser smoke test.

Requires Python, Playwright, and a Chromium browser. The app itself requires
none of these dependencies. The test loads the files inline, creates a short
game, and verifies bids, total scores, the round result, and final standings.
"""

from pathlib import Path
import json
import shutil
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]

LOCAL_STORAGE_MOCK = """
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


def build_inline_document() -> str:
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    css = (ROOT / "styles.css").read_text(encoding="utf-8")
    html = html.replace('<link rel="stylesheet" href="styles.css">', f"<style>{css}</style>")
    for script in (
        '<script defer src="js/game-logic.js"></script>',
        '<script defer src="js/state-manager.js"></script>',
        '<script defer src="js/storage.js"></script>',
        '<script defer src="js/ui-components.js"></script>',
        '<script defer src="js/result-view.js"></script>',
        '<script defer src="js/persistence-controller.js"></script>',
        '<script defer src="js/setup-controller.js"></script>',
        '<script defer src="js/history-controller.js"></script>',
        '<script defer src="js/game-view.js"></script>',
        '<script defer src="js/round-result-view.js"></script>',
        '<script defer src="js/round-controller.js"></script>',
        '<script defer src="js/special-cards-controller.js"></script>',
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
        (ROOT / "js/ui-components.js").read_text(encoding="utf-8"),
        (ROOT / "js/result-view.js").read_text(encoding="utf-8"),
        (ROOT / "js/persistence-controller.js").read_text(encoding="utf-8"),
        (ROOT / "js/setup-controller.js").read_text(encoding="utf-8"),
        (ROOT / "js/history-controller.js").read_text(encoding="utf-8"),
        (ROOT / "js/game-view.js").read_text(encoding="utf-8"),
        (ROOT / "js/round-result-view.js").read_text(encoding="utf-8"),
        (ROOT / "js/round-controller.js").read_text(encoding="utf-8"),
        (ROOT / "js/special-cards-controller.js").read_text(encoding="utf-8"),
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
        page.evaluate(LOCAL_STORAGE_MOCK)
        for script in scripts:
            page.add_script_tag(content=script)
        page.evaluate(
            """
            const damagedState = WizardGameLogic.createInitialGameState(3);
            damagedState.players[1].id = damagedState.players[0].id;
            damagedState.updatedAt = "2026-01-01T00:00:00.000Z";
            localStorage.setItem(
              WizardStorage.STORAGE_KEY,
              JSON.stringify(damagedState)
            );
            """
        )
        page.evaluate("document.dispatchEvent(new Event('DOMContentLoaded'))")

        assert page.locator("#storage-warning").is_visible()
        assert "corrupted" in page.locator("#storage-warning").text_content()

        new_game_box = page.locator("#btn-new-game").bounding_box()
        secondary_row_box = page.locator(".home-secondary-actions").bounding_box()
        history_box = page.locator("#btn-history").bounding_box()
        import_box = page.locator("#btn-import-game").bounding_box()
        assert new_game_box and secondary_row_box and history_box and import_box
        assert abs(history_box["width"] - import_box["width"]) < 1
        assert abs(history_box["y"] - import_box["y"]) < 1
        assert abs(new_game_box["width"] - secondary_row_box["width"]) < 1

        page.once("dialog", lambda dialog: dialog.accept())
        page.click("#btn-new-game")
        assert page.locator("#storage-warning").is_hidden()
        assert page.evaluate(
            """
            (() => {
              const saved = JSON.parse(localStorage.getItem(WizardStorage.STORAGE_KEY));
              return new Set(saved.players.map((player) => player.id)).size === saved.players.length;
            })()
            """
        )
        assert page.locator("#screen-setup").is_visible()
        assert page.locator("#screen-setup h2").count() == 0
        assert page.locator("#rounds-title").text_content() == "Game Length"
        assert page.get_by_text("The order matches the seating order at the table.").count() == 0
        assert page.get_by_text("Wizard-Standard:").count() == 0
        assert page.get_by_text("Maximum with 70 cards:").count() == 0
        assert page.locator("#btn-setup-home").get_attribute("aria-label") == "Home"
        assert page.locator("#player-list label").count() == 0
        assert page.locator("#btn-round-mode-full").get_attribute("aria-checked") == "true"
        assert page.locator("#btn-round-mode-full").text_content().strip() == "Full Game (20 Rounds)"
        assert page.locator("#btn-round-mode-individual").get_attribute("aria-checked") == "false"
        assert page.locator("#custom-round-controls").is_hidden()
        assert page.locator("#rounds-input").get_attribute("max") == "23"
        assert page.locator("#player-list .text-input").evaluate_all(
            "(inputs) => inputs.every((input) => input.getAttribute('aria-invalid') === 'false')"
        )
        page.click("#btn-round-mode-individual")
        assert page.locator("#custom-round-controls").is_visible()
        assert page.locator("#btn-round-mode-individual").get_attribute("aria-checked") == "true"
        for index, name in enumerate(("Anna", "Ben", "Chris")):
            assert page.locator("#player-list .text-input").nth(index).get_attribute("placeholder") == f"Player {index + 1}"
            page.locator("#player-list .text-input").nth(index).fill(name)
        assert page.locator("#player-list .player-row").evaluate_all(
            "(rows) => rows.map((row) => row.dataset.playerColor)"
        ) == ["1", "2", "3"]
        page.fill("#rounds-input", "1")
        page.dispatch_event("#rounds-input", "change")
        page.click("#setup-form button[type=submit]")
        assert page.locator("#screen-setup-summary").is_visible()
        assert page.locator("#summary-player-count").text_content() == "3 Players"
        assert page.locator("#summary-round-count").text_content() == "1 Round"
        assert page.locator(".summary-list > div").all_text_contents() == [
            "3 Players", "1 Round", "Random Dealer"
        ]
        assert len(set(page.locator(".summary-list > div").evaluate_all(
            "(items) => items.map((item) => Math.round(item.getBoundingClientRect().top))"
        ))) == 1
        assert page.locator("#summary-dealer").count() == 0
        assert page.locator("#summary-starter").count() == 0
        seat_rows = page.locator("#summary-seat-order .seat-order-item")
        assert seat_rows.count() == 3
        assert page.locator("#summary-seat-order .seat-position").all_text_contents() == ["1", "2", "3"]
        assert page.locator("#summary-seat-order .seat-player-name").all_text_contents() == ["Anna", "Ben", "Chris"]
        assert seat_rows.evaluate_all(
            "(rows) => rows.map((row) => row.dataset.playerColor)"
        ) == ["1", "2", "3"]
        assert page.locator("#summary-seat-order .seat-player-main").count() == 3
        assert page.locator("#summary-seat-order .seat-player-main > .seat-player-name").count() == 3
        assert page.locator("#summary-seat-order .seat-player-main > .seat-role-badges").count() == 3
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

        assert page.locator("#game-phase-label").text_content() == "Bids"
        assert page.locator("#game-title").text_content() == "Round 1 of 1"
        assert page.locator("#btn-game-help").is_visible()
        assert page.locator("#btn-game-help").text_content().strip() == "?"
        assert page.locator("#btn-game-home").get_attribute("aria-label") == "Home"
        assert page.locator("#btn-game-home").text_content().strip() == ""
        assert page.get_by_text("Current Total Score").count() == 0
        assert page.get_by_text("Entry starts with the starting player.").count() == 0
        assert page.get_by_text("Starts the bidding").count() == 0
        assert page.locator("#game-dealer").count() == 0
        assert page.locator("#game-starter").count() == 0
        assert page.locator("#game-content h3").all_text_contents() == ["Bids"]
        assert page.locator("#game-round-overview #game-total-points .points-card").count() == 3
        assert page.locator("#game-total-points > .points-strip").count() == 1
        seat_names = ["Anna", "Ben", "Chris"]
        starter_index = seat_names.index(starter)
        expected_overview_names = seat_names[starter_index:] + seat_names[:starter_index]
        expected_overview_colors = [
            str(seat_names.index(name) + 1) for name in expected_overview_names
        ]
        assert page.locator("#game-total-points .points-card").evaluate_all(
            "(cards) => cards.map((card) => card.dataset.playerColor)"
        ) == expected_overview_colors
        assert page.locator("#game-total-points .points-card span").all_text_contents() == expected_overview_names
        assert len(set(page.locator("#game-total-points .points-card").evaluate_all(
            "(cards) => cards.map((card) => Math.round(card.getBoundingClientRect().top))"
        ))) == 1
        assert sorted(page.locator(".bid-panel .entry-row").evaluate_all(
            "(rows) => rows.map((row) => row.dataset.playerColor)"
        )) == ["1", "2", "3"]
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
        bid_status = page.locator(".bid-panel .bid-total-card")
        bid_values = bid_status.locator(".bid-total-values")
        assert bid_status.locator("strong").text_content().strip() == "Total Bids:"
        assert bid_values.text_content().strip() == "0 / 1"
        assert bid_values.evaluate("(element) => element.classList.contains('valid')")
        assert "success" not in bid_status.get_attribute("class")
        assert "error" not in bid_status.get_attribute("class")
        page.locator(".entry-row").nth(0).locator(".value-button").nth(1).click()
        assert bid_values.text_content().strip() == "1 / 1"
        assert bid_values.evaluate("(element) => element.classList.contains('invalid')")
        assert page.get_by_role("button", name="Confirm Bids").is_disabled()
        page.locator(".entry-row").nth(1).locator(".value-button").nth(1).click()
        assert bid_values.text_content().strip() == "2 / 1"
        assert bid_values.evaluate("(element) => element.classList.contains('valid')")
        assert page.get_by_role("button", name="Confirm Bids").is_enabled()
        page.click('button:has-text("Confirm Bids")')
        assert page.locator("#game-round-overview").is_hidden()
        assert page.get_by_text("Current Bids").count() == 0
        assert page.get_by_text("Only Cloud, Bomb, and Witch affect scoring.").count() == 0
        assert page.locator("#game-content h3").count() == 0
        assert page.get_by_text("select", exact=True).count() == 0
        assert page.get_by_text("click again to remove", exact=True).count() == 0
        assert page.locator(".bid-overview .score-row.header span").all_text_contents() == [
            "Player", "Bid", "Points"
        ]
        assert page.locator(".bid-overview .score-row .number").evaluate_all(
            "(cells) => cells.every((cell) => getComputedStyle(cell).textAlign === 'center')"
        )
        assert page.locator(".bid-overview .score-player-name").all_text_contents() == expected_overview_names
        assert page.locator(".bid-overview .score-player-name").evaluate_all(
            "(names) => names.every((name) => Number(getComputedStyle(name).fontWeight) >= 800)"
        )
        assert page.locator(".bid-overview .score-row:not(.header)").evaluate_all(
            "(rows) => rows.map((row) => row.dataset.playerColor)"
        ) == expected_overview_colors
        assert page.locator(".bid-overview .leader-crown").count() == 0
        assert page.locator(".bid-overview .leader-points").count() == 0
        overview_starter = page.locator(".bid-overview .starter")
        assert overview_starter.count() == 1
        overview_starter_row = overview_starter.locator("xpath=../..")
        assert overview_starter_row.locator(".score-player-name").text_content() == starter
        overview_name_box = overview_starter_row.locator(".score-player-name").bounding_box()
        overview_badge_box = overview_starter.bounding_box()
        assert overview_name_box and overview_badge_box
        assert overview_badge_box["x"] >= overview_name_box["x"] + overview_name_box["width"]
        witch = page.locator(".special-button", has_text="Witch")
        assert witch.is_disabled()
        bomb = page.locator(".special-button", has_text="Bomb")
        bomb.click()
        assert bomb.get_attribute("aria-pressed") == "true"
        assert "✓" not in bomb.text_content()
        assert witch.is_enabled()
        bomb.click()
        assert page.locator(".special-button", has_text="Witch").is_disabled()

        # With both Cloud and Bomb active, the Witch offers both possible repeats.
        page.locator(".special-button", has_text="Cloud").click()
        assert page.locator("#cloud-dialog-help").count() == 0
        cloud_heading_box = page.locator("#cloud-dialog .dialog-heading").bounding_box()
        cloud_players_box = page.locator("#cloud-player-options").bounding_box()
        assert cloud_heading_box and cloud_players_box
        assert cloud_players_box["y"] - (cloud_heading_box["y"] + cloud_heading_box["height"]) >= 16
        page.locator("#cloud-player-options button").first.click()
        assert page.locator("#btn-cloud-minus").evaluate(
            "(button) => getComputedStyle(button).color"
        ) == "rgb(240, 160, 160)"
        assert page.locator("#btn-cloud-plus").evaluate(
            "(button) => getComputedStyle(button).color"
        ) == "rgb(131, 201, 163)"
        assert page.get_by_text("had the following bid before this Cloud").count() == 0
        page.click("#btn-cloud-plus")
        page.locator(".special-button", has_text="Bomb").click()

        # Cloud +1 may result in a current bid of 2 in round 1.
        saved_cloud_state = page.evaluate(
            """
            (() => {
              const saved = WizardStorage.loadGame();
              const round = saved?.rounds?.[0];
              return {
                readable: Boolean(saved),
                currentBids: Object.values(round?.playerResults ?? {})
                  .map((result) => result.currentBid),
                cloudActive: round?.specialCards?.cloud?.active,
                bombActive: round?.specialCards?.bomb?.active,
                storageError: WizardStorage.getStorageErrors().gameError,
                serialized: localStorage.getItem(WizardStorage.STORAGE_KEY)
              };
            })()
            """
        )
        assert saved_cloud_state["readable"]
        assert 2 in saved_cloud_state["currentBids"]
        assert saved_cloud_state["cloudActive"]
        assert saved_cloud_state["bombActive"]
        assert saved_cloud_state["storageError"] == ""

        # A fresh page context must load and continue the same state.
        reload_page = browser.new_page(viewport={"width": 390, "height": 844})
        reload_page.set_content(html)
        reload_page.evaluate(LOCAL_STORAGE_MOCK)
        for script in scripts:
            reload_page.add_script_tag(content=script)
        reload_page.evaluate(
            """
            (serialized) => localStorage.setItem(
              WizardStorage.STORAGE_KEY,
              serialized
            )
            """,
            saved_cloud_state["serialized"],
        )
        reload_page.evaluate("document.dispatchEvent(new Event('DOMContentLoaded'))")
        assert reload_page.locator("#btn-continue-game").is_enabled()
        reload_page.click("#btn-continue-game")
        assert reload_page.locator("#screen-game").is_visible()
        assert "2" in reload_page.locator(".bid-overview .changed-bid").all_text_contents()
        assert reload_page.evaluate("WizardStorage.getStorageErrors().gameError") == ""
        reload_page.close()

        page.locator(".special-button", has_text="Witch").click()
        assert page.get_by_text("Check entries", exact=True).count() == 0
        assert page.locator(".special-button", has_text="2nd Cloud").count() == 1
        assert page.locator(".special-button", has_text="2nd Bomb").count() == 1
        assert page.locator(".special-button", has_text="2nd Cloud").text_content().strip() == "☁ 2nd Cloud"
        assert page.locator(".special-button", has_text="2nd Bomb").text_content().strip() == "💣 2nd Bomb"
        assert page.get_by_role("button", name="Enter Tricks").is_disabled()
        second_effect_box = page.locator(".second-effect-wrap").bounding_box()
        special_actions_box = page.locator(".special-actions").bounding_box()
        assert second_effect_box and special_actions_box
        assert special_actions_box["y"] - (second_effect_box["y"] + second_effect_box["height"]) >= 16

        # An incomplete Witch selection blocks navigation back to bids.
        page.get_by_role("button", name="Edit Bids").click()
        assert page.locator("#toast").text_content() == (
            "Choose the Witch's second special card first or remove the Witch."
        )
        assert page.locator("#game-phase-label").text_content() == "Special Cards"
        assert page.locator(".special-button", has_text="Witch").get_attribute("aria-pressed") == "true"
        assert page.evaluate("WizardStorage.loadGame().rounds[0].phase") == "play"

        # This temporary state remains resumable after a reload.
        incomplete_witch_state = page.evaluate(
            "localStorage.getItem(WizardStorage.STORAGE_KEY)"
        )
        witch_reload_page = browser.new_page(viewport={"width": 390, "height": 844})
        witch_reload_page.set_content(html)
        witch_reload_page.evaluate(LOCAL_STORAGE_MOCK)
        for script in scripts:
            witch_reload_page.add_script_tag(content=script)
        witch_reload_page.evaluate(
            """
            (serialized) => localStorage.setItem(
              WizardStorage.STORAGE_KEY,
              serialized
            )
            """,
            incomplete_witch_state,
        )
        witch_reload_page.evaluate("document.dispatchEvent(new Event('DOMContentLoaded'))")
        assert witch_reload_page.locator("#btn-continue-game").is_enabled()
        witch_reload_page.click("#btn-continue-game")
        assert witch_reload_page.locator("#game-phase-label").text_content() == "Special Cards"
        assert witch_reload_page.locator(
            ".special-button", has_text="Witch"
        ).get_attribute("aria-pressed") == "true"
        assert witch_reload_page.evaluate("WizardStorage.getStorageErrors().gameError") == ""
        witch_reload_page.close()

        # Navigation back is allowed after selecting a complete second card.
        second_bomb = page.locator(".special-button", has_text="2nd Bomb")
        second_bomb.click()
        page.get_by_role("button", name="Edit Bids").click()
        assert page.locator("#game-phase-label").text_content() == "Bids"
        page.get_by_role("button", name="Confirm Bids").click()
        assert page.locator("#game-phase-label").text_content() == "Special Cards"
        second_bomb = page.locator(".special-button", has_text="2nd Bomb")
        assert "active" in second_bomb.get_attribute("class")

        # The second Bomb and second Cloud can each be toggled with the same button.
        second_bomb.click()
        assert page.get_by_role("button", name="Enter Tricks").is_disabled()
        second_bomb.click()
        assert second_bomb.get_attribute("class") and "active" in second_bomb.get_attribute("class")
        assert "✓" not in second_bomb.text_content()
        second_bomb.click()
        assert page.get_by_role("button", name="Enter Tricks").is_disabled()

        page.locator(".special-button", has_text="2nd Cloud").click()
        page.locator("#cloud-player-options button").first.click()
        page.click("#btn-cloud-plus")
        second_cloud = page.locator(".special-button", has_text="2nd Cloud")
        assert "active" in second_cloud.get_attribute("class")
        second_cloud.click()
        assert page.get_by_role("button", name="Enter Tricks").is_disabled()

        # Turn off the Witch and both primary cards again.
        page.locator(".special-button", has_text="Witch").click()
        page.locator(".special-button", has_text="Bomb").click()
        page.locator(".special-button", has_text="Cloud").click()
        assert page.locator("button", has_text="Undo").count() == 0

        page.click('button:has-text("Enter Tricks")')
        assert page.locator("#game-round-overview").is_hidden()
        assert page.locator("#game-phase-label").text_content() == "Tricks"
        assert page.locator("#game-content h3").all_text_contents() == ["Tricks"]
        assert page.get_by_text("Enter only each player's final trick count for this round.").count() == 0
        assert page.locator(".tricks-panel .entry-meta").count() == 0
        assert page.locator(".tricks-panel .entry-name").all_text_contents() == expected_overview_names
        assert page.locator(".tricks-panel .entry-row").evaluate_all(
            "(rows) => rows.map((row) => row.dataset.playerColor)"
        ) == expected_overview_colors
        trick_status = page.locator(".trick-status")
        assert trick_status.locator("strong").text_content().strip() == "Total Tricks:"
        assert trick_status.locator(".trick-total-values").text_content().strip() == "0 / 1"
        assert "invalid" in trick_status.locator(".trick-total-values").get_attribute("class")
        assert trick_status.locator(":scope > *").count() == 2
        trick_list_box = page.locator(".tricks-panel .entry-list").bounding_box()
        trick_status_box = trick_status.bounding_box()
        trick_actions_box = page.locator(".tricks-panel .round-actions").bounding_box()
        assert trick_list_box and trick_status_box and trick_actions_box
        assert trick_status_box["y"] - (trick_list_box["y"] + trick_list_box["height"]) >= 16
        assert trick_actions_box["y"] - (trick_status_box["y"] + trick_status_box["height"]) >= 16
        correct_button = page.locator(".correct-button:not(:disabled)").first
        assert correct_button.text_content().strip().startswith("Bid ")
        assert correct_button.evaluate(
            "(button) => getComputedStyle(button).color"
        ) == "rgb(240, 160, 160)"
        correct_button_box = correct_button.bounding_box()
        correct_stepper_box = correct_button.locator("xpath=..").locator(".value-stepper").bounding_box()
        assert correct_button_box and correct_stepper_box
        assert correct_button_box["x"] + correct_button_box["width"] <= correct_stepper_box["x"]
        correct_button.click()
        assert "1" in page.locator(".value-display").all_text_contents()
        assert page.locator(".correct-button.correct:disabled").count() >= 1
        assert trick_status.locator(".trick-total-values").text_content().strip() == "1 / 1"
        assert "valid" in trick_status.locator(".trick-total-values").get_attribute("class")
        page.click('button:has-text("Complete Round")')

        assert page.locator("#game-phase-label").text_content() == "Round Result"
        assert page.locator("#btn-game-help").is_visible()
        assert page.locator("#game-content h3").all_text_contents() == ["Round Result"]
        assert page.locator(".round-result-panel .leader-crown").count() >= 1
        assert page.locator(".round-result-panel .leader-points").count() == page.locator(
            ".round-result-panel .leader-crown"
        ).count()
        leader_player = page.locator(".round-result-panel .leader-crown").first.locator("xpath=..")
        leader_name_box = leader_player.locator("strong").bounding_box()
        leader_crown_box = leader_player.locator(".leader-crown").bounding_box()
        assert leader_name_box and leader_crown_box
        assert abs(
            (leader_name_box["y"] + leader_name_box["height"] / 2)
            - (leader_crown_box["y"] + leader_crown_box["height"] / 2)
        ) <= 2
        assert page.locator(".round-result-panel .score-row .number").evaluate_all(
            "(cells) => cells.every((cell) => getComputedStyle(cell).textAlign === 'center')"
        )
        assert page.get_by_text("Round points and current total score after this round.").count() == 0
        assert page.locator(".score-row.header span").all_text_contents() == [
            "Player", "Bid", "Tricks", "Round", "Total"
        ]
        assert page.locator(".score-row.header span:visible").all_text_contents() == [
            "Player", "Round", "Total"
        ]
        assert page.locator(".score-table .score-row:not(.header)").first.locator(
            ":scope > span:visible"
        ).count() == 3
        assert page.locator(".round-result-panel .score-player strong").all_text_contents() == expected_overview_names
        assert page.locator(".score-table .score-row:not(.header)").evaluate_all(
            "(rows) => rows.map((row) => row.dataset.playerColor)"
        ) == expected_overview_colors
        result_table_box = page.locator(".round-result-panel .score-table-scroll").bounding_box()
        result_actions_box = page.locator(".round-result-panel .result-actions").bounding_box()
        result_action_buttons = page.locator(".round-result-panel .result-actions > .button")
        assert result_table_box and result_actions_box
        assert len(set(result_action_buttons.evaluate_all(
            "(buttons) => buttons.map((button) => Math.round(button.getBoundingClientRect().top))"
        ))) == 1
        assert result_table_box["x"] >= 0
        assert result_table_box["x"] + result_table_box["width"] <= 390
        assert page.evaluate("document.documentElement.scrollWidth") == 390
        assert result_actions_box["y"] - (result_table_box["y"] + result_table_box["height"]) >= 16
        page.click('button:has-text("Finish Game")')
        assert page.get_by_text("game completed").count() == 0
        assert page.locator("#winner-summary").count() == 0
        assert page.locator("#final-game-meta").count() == 0
        assert page.get_by_text("Round points and completed total score for all players.").count() == 0
        assert page.locator("#final-ranking .ranking-position").all_text_contents() == ["🥇", "🥈", "🥉"]
        assert page.locator("#final-ranking .ranking-row").evaluate_all(
            "(rows) => rows.every((row) => Number(row.dataset.rank) <= 3)"
        )
        assert page.locator(
            "#final-ranking .ranking-row[data-rank='1'] .ranking-name, "
            "#final-ranking .ranking-row[data-rank='1'] .ranking-points"
        ).evaluate_all(
            "(elements) => elements.every((element) => getComputedStyle(element).color === 'rgb(251, 217, 109)')"
        )
        assert page.locator("#btn-finished-home").count() == 0
        assert page.locator(".final-ranking-panel > #finished-title").text_content().strip() == "Final Result"
        assert page.locator("#btn-finished-go-home").text_content().strip() == "Home"
        assert page.locator(".history-table tbody tr").count() == 1
        assert page.locator("#final-score-history .history-table thead th[data-player-color]").all_text_contents() == (
            page.locator("#final-ranking .ranking-name").all_text_contents()
        )
        assert page.locator("#final-score-history .history-table thead th[data-player-color]").evaluate_all(
            """(headers) => headers.every((header) => {
              const bar = getComputedStyle(header, "::before");
              return bar.left === "4px" && bar.right === "4px" && bar.height === "4px";
            })"""
        )
        assert page.locator("#final-score-history .history-table tbody td[data-player-color]").evaluate_all(
            "(cells) => cells.every((cell) => getComputedStyle(cell).backgroundColor === 'rgba(0, 0, 0, 0)')"
        )
        history_headers = page.locator("#final-score-history .history-table thead th")
        round_header_box = history_headers.first.bounding_box()
        first_player_header_box = history_headers.nth(1).bounding_box()
        assert round_header_box and first_player_header_box
        assert round_header_box["width"] < first_player_header_box["width"]
        assert page.locator("#final-score-history .history-table th, #final-score-history .history-table td").evaluate_all(
            "(cells) => cells.every((cell) => getComputedStyle(cell).textAlign === 'center')"
        )
        assert page.locator("#final-score-history .history-table tfoot .leader-total").count() == page.locator(
            "#final-ranking .ranking-row[data-rank='1']"
        ).count()

        # The new Home button opens the same saved score history.
        page.click("#btn-finished-go-home")
        assert page.locator("#screen-home").is_visible()
        assert page.locator("#btn-history").is_enabled()
        page.click("#btn-history")
        assert page.locator("#history-game-list .history-game-card").count() == 1
        assert page.locator("#history-list-view").is_visible()
        assert page.locator("#history-detail-view").is_hidden()
        page.locator("#history-game-list .history-game-card").click()
        assert page.locator("#history-detail-view").is_visible()
        assert page.locator("#history-detail-ranking .ranking-position").all_text_contents() == ["🥇", "🥈", "🥉"]
        assert page.locator("#history-score-content .history-table tbody tr").count() == 1
        assert page.locator("#history-score-content .history-table thead th[data-player-color]").all_text_contents() == (
            page.locator("#history-detail-ranking .ranking-name").all_text_contents()
        )

        with page.expect_download() as single_download_info:
            page.click("#btn-history-export-game")
        single_download = single_download_info.value
        assert single_download.suggested_filename.startswith("wizard-game-")
        single_export = json.loads(Path(single_download.path()).read_text(encoding="utf-8"))
        assert single_export["exportFormat"] == "wizard-scoreboard-game"

        page.click("#btn-history-list-back")
        assert page.locator("#history-list-view").is_visible()

        with page.expect_download() as archive_download_info:
            page.click("#btn-history-export-all")
        archive_download = archive_download_info.value
        archive_path = archive_download.path()
        archive_export = json.loads(Path(archive_path).read_text(encoding="utf-8"))
        assert archive_export["exportFormat"] == "wizard-scoreboard-history"
        assert len(archive_export["games"]) == 1

        page.locator("#history-game-list .history-game-card").click()
        page.once("dialog", lambda dialog: dialog.accept())
        page.click("#btn-history-delete-game")
        assert page.get_by_text("No archived games available.").is_visible()
        assert page.locator("#btn-history-export-all").is_disabled()
        assert page.locator("#btn-history-clear").is_disabled()
        assert page.locator("#btn-history").is_disabled()

        page.set_input_files("#import-file-input", archive_path)
        page.locator("#history-game-list .history-game-card").wait_for(state="visible")
        assert page.locator("#history-game-list .history-game-card").count() == 1
        assert page.locator("#btn-history-export-all").is_enabled()

        page.once("dialog", lambda dialog: dialog.accept())
        page.click("#btn-history-clear")
        assert page.get_by_text("No archived games available.").is_visible()
        assert page.locator("#btn-history").is_disabled()

        # Without usable localStorage, the in-memory game remains accessible.
        memory_page = browser.new_page(viewport={"width": 390, "height": 844})
        memory_page.set_content(html)
        memory_page.evaluate(LOCAL_STORAGE_MOCK)
        for script in scripts:
            memory_page.add_script_tag(content=script)
        memory_page.evaluate(
            """
            localStorage.setItem = () => {
              throw new DOMException("Storage blocked", "SecurityError");
            };
            document.dispatchEvent(new Event("DOMContentLoaded"));
            """
        )
        memory_page.click("#btn-new-game")
        assert memory_page.locator("#screen-setup").is_visible()
        assert memory_page.locator("#storage-warning").is_visible()
        memory_page.click("#btn-setup-home")
        assert memory_page.locator("#screen-home").is_visible()
        assert memory_page.locator("#btn-continue-game").is_enabled()
        memory_page.click("#btn-continue-game")
        assert memory_page.locator("#screen-setup").is_visible()
        memory_page.close()

        # After an external deletion, an outdated in-memory state must not be
        # offered as a resumable game.
        conflict_page = browser.new_page(viewport={"width": 390, "height": 844})
        conflict_page.set_content(html)
        conflict_page.evaluate(LOCAL_STORAGE_MOCK)
        for script in scripts:
            conflict_page.add_script_tag(content=script)
        conflict_page.evaluate("document.dispatchEvent(new Event('DOMContentLoaded'))")
        conflict_page.click("#btn-new-game")
        conflict_page.evaluate(
            """
            localStorage.removeItem(WizardStorage.STORAGE_KEY);
            const storageEvent = new Event("storage");
            Object.defineProperties(storageEvent, {
              key: { value: WizardStorage.STORAGE_KEY },
              newValue: { value: null },
              storageArea: { value: localStorage }
            });
            window.dispatchEvent(storageEvent);
            """
        )
        assert conflict_page.locator("#storage-conflict-actions").is_visible()
        assert conflict_page.locator("#btn-add-player").is_disabled()
        assert conflict_page.locator("#player-list .text-input").first.is_disabled()
        assert conflict_page.locator("#setup-form button[type=submit]").is_disabled()
        assert conflict_page.locator("#btn-setup-home").is_enabled()
        with conflict_page.expect_download() as conflict_download_info:
            conflict_page.click("#btn-export-conflict-state")
        conflict_export = json.loads(
            Path(conflict_download_info.value.path()).read_text(encoding="utf-8")
        )
        assert conflict_export["exportFormat"] == "wizard-scoreboard-game"
        assert conflict_export["recoveryReason"] == "storage-conflict"
        assert conflict_export["gameState"]["gameId"]
        conflict_page.click("#btn-setup-home")
        assert conflict_page.locator("#screen-home").is_visible()
        assert conflict_page.locator("#btn-continue-game").is_disabled()
        assert "another tab" in conflict_page.locator("#storage-warning").text_content()

        # The separate conflict export can then be restored deliberately.
        conflict_page.set_input_files(
            "#import-file-input",
            conflict_download_info.value.path(),
        )
        conflict_page.locator("#storage-conflict-actions").wait_for(state="hidden")
        assert conflict_page.locator("#storage-conflict-actions").is_hidden()
        assert conflict_page.locator("#btn-continue-game").is_enabled()
        conflict_page.click("#btn-continue-game")
        assert conflict_page.locator("#screen-setup").is_visible()
        assert conflict_page.locator("#btn-add-player").is_enabled()
        conflict_page.close()

        browser.close()

    print("Browser smoke test passed.")


if __name__ == "__main__":
    main()
