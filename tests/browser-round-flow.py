"""Zwei vollständige Runden einschließlich nachträglicher Ergebniskorrektur."""

from playwright.sync_api import sync_playwright
from browser_helpers import assert_persisted, launch_browser, open_clean_page, serve_app, set_values, start_game


def complete_round(page, tricks):
    page.get_by_role("button", name="Ansagen bestätigen").click()
    assert_persisted(page)
    page.get_by_role("button", name="Stiche eintragen").click()
    assert_persisted(page)
    set_values(page, ".tricks-panel", tricks)
    page.get_by_role("button", name="Runde abschließen").click()
    assert_persisted(page)


def main():
    with serve_app() as url, sync_playwright() as playwright:
        browser = launch_browser(playwright)
        context = browser.new_context()
        page = open_clean_page(context, url)
        start_game(page, rounds=2)

        complete_round(page, (1, 0, 0))
        page.get_by_role("button", name="Nächste Runde").click()
        assert_persisted(page)
        assert page.locator("#game-title").text_content() == "Runde 2 von 2"

        complete_round(page, (2, 0, 0))
        page.get_by_role("button", name="Runde bearbeiten").click()
        page.click("#btn-edit-tricks")
        assert_persisted(page)

        first_row = page.locator(".tricks-panel .entry-row").nth(0)
        second_row = page.locator(".tricks-panel .entry-row").nth(1)
        first_row.locator(".value-button").nth(0).click()
        assert_persisted(page)
        second_row.locator(".value-button").nth(1).click()
        assert_persisted(page)
        page.get_by_role("button", name="Runde abschließen").click()
        assert_persisted(page)

        saved = page.evaluate(
            """
            (() => {
              const game = WizardStorage.loadGame();
              return {
                rounds: game.rounds.length,
                completed: game.rounds.filter((round) => round.completed).length
              };
            })()
            """
        )
        assert saved == {"rounds": 2, "completed": 2}
        page.get_by_role("button", name="Spiel beenden").click()
        assert_persisted(page)
        assert page.locator("#screen-finished").is_visible()
        context.close()
        browser.close()

    print("Browser-Rundenflusstests erfolgreich.")


if __name__ == "__main__":
    main()

