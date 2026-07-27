"""Echte Service-Worker-Installation und Offline-Navigation."""

from playwright.sync_api import sync_playwright
from browser_helpers import launch_browser, open_clean_page, serve_app


def main():
    with serve_app() as url, sync_playwright() as playwright:
        browser = launch_browser(playwright)
        context = browser.new_context(service_workers="allow")
        page = open_clean_page(context, url)
        page.evaluate("navigator.serviceWorker.ready")
        page.reload()
        assert page.evaluate("navigator.serviceWorker.controller !== null")

        context.set_offline(True)
        page.reload()
        assert page.locator("#home-title").text_content() == "Wizard"
        assert page.locator("#screen-home").is_visible()
        context.set_offline(False)
        context.close()
        browser.close()

    print("Browser-Offlinetest erfolgreich.")


if __name__ == "__main__":
    main()

