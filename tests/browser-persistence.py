"""Persistenztests für Wolken, Hexe und einen tatsächlichen Seiten-Reload."""

from playwright.sync_api import sync_playwright
from browser_helpers import assert_persisted, launch_browser, open_clean_page, serve_app, set_values, start_game


def continue_after_reload(page):
    page.reload()
    assert page.locator("#btn-continue-game").is_enabled()
    page.click("#btn-continue-game")
    assert page.locator("#screen-game").is_visible()
    assert_persisted(page)


def main():
    with serve_app() as url, sync_playwright() as playwright:
        browser = launch_browser(playwright)
        context = browser.new_context()
        page = open_clean_page(context, url)
        start_game(page, rounds=1)

        set_values(page, ".bid-panel", (1, 1, 0))
        page.get_by_role("button", name="Ansagen bestätigen").click()
        assert_persisted(page)

        page.locator(".special-button", has_text="Wolke").click()
        page.locator("#cloud-player-options button").first.click()
        page.click("#btn-cloud-plus")
        assert_persisted(page)
        assert "2" in page.locator(".bid-overview .changed-bid").all_text_contents()

        continue_after_reload(page)
        assert page.locator("#game-phase-label").text_content() == "Sonderkarten"
        assert "2" in page.locator(".bid-overview .changed-bid").all_text_contents()

        page.locator(".special-button", has_text="Hexe").click()
        page.get_by_role("button", name="Ansagen bearbeiten").click()
        assert page.locator("#game-phase-label").text_content() == "Sonderkarten"
        assert "zweite Sonderkarte" in page.locator("#toast").text_content()
        assert_persisted(page)

        page.locator(".special-button", has_text="2. Wolke").click()
        page.locator("#cloud-player-options button").first.click()
        page.click("#btn-cloud-plus")
        assert_persisted(page)
        assert "3" in page.locator(".bid-overview .changed-bid").all_text_contents()

        continue_after_reload(page)
        assert "3" in page.locator(".bid-overview .changed-bid").all_text_contents()
        context.close()
        browser.close()

    print("Browser-Persistenztests erfolgreich.")


if __name__ == "__main__":
    main()
