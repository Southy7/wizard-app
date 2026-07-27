"""Die Kernanwendung startet auch ohne das optionale History-Modul."""

from playwright.sync_api import sync_playwright
from browser_helpers import launch_browser, serve_app


def main():
    with serve_app() as url, sync_playwright() as playwright:
        browser = launch_browser(playwright)
        context = browser.new_context()
        page = context.new_page()
        page.route("**/js/history-controller.js", lambda route: route.abort())
        page.goto(url)

        assert page.locator("#screen-home").is_visible()
        assert page.locator("#home-title").text_content() == "Wizard"
        assert page.locator("#btn-history").is_disabled()
        page.click("#btn-new-game")
        assert page.locator("#screen-setup").is_visible()
        assert page.evaluate("WizardStorage.loadGame() !== null")

        context.close()
        browser.close()

    print("Browser-Kerntest ohne History erfolgreich.")


if __name__ == "__main__":
    main()

