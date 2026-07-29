"""Real service-worker installation and offline navigation."""

from playwright.sync_api import sync_playwright
from browser_helpers import launch_browser, serve_app


def main():
    with serve_app() as url, sync_playwright() as playwright:
        browser = launch_browser(playwright)
        context = browser.new_context(service_workers="allow")
        page = context.new_page()
        page.add_init_script(
            """
            sessionStorage.setItem(
              "wizardPageLoads",
              String(Number(sessionStorage.getItem("wizardPageLoads") || 0) + 1)
            );
            """
        )
        page.goto(url)
        page.evaluate("navigator.serviceWorker.ready")
        page.wait_for_function("navigator.serviceWorker.controller !== null")

        # The first worker claim must not be mistaken for an update and reload the initial page.
        assert page.evaluate("Number(sessionStorage.getItem('wizardPageLoads'))") == 1

        page.reload()
        assert page.evaluate("navigator.serviceWorker.controller !== null")
        assert page.evaluate("Number(sessionStorage.getItem('wizardPageLoads'))") == 2

        context.set_offline(True)
        page.reload()
        assert page.locator("#home-title").text_content() == "Wizard"
        assert page.locator("#screen-home").is_visible()
        assert page.evaluate("Number(sessionStorage.getItem('wizardPageLoads'))") == 3
        context.set_offline(False)
        context.close()
        browser.close()

    print("Browser offline test passed.")


if __name__ == "__main__":
    main()
