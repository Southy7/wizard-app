"""Native multi-tab, blocked-storage, and quota scenarios."""

from playwright.sync_api import sync_playwright
from browser_helpers import launch_browser, open_clean_page, serve_app

FAIL_WRITES_SCRIPT = """
(() => {
  const original = Storage.prototype.setItem;
  Storage.prototype.setItem = function(key, value) {
    if (window.__failGameWrites && String(key).includes("game-state")) {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    }
    return original.call(this, key, value);
  };
})();
"""

BLOCK_STORAGE_SCRIPT = """
Storage.prototype.setItem = function() {
  throw new DOMException("Storage blocked", "SecurityError");
};
"""


def main():
    with serve_app() as url, sync_playwright() as playwright:
        browser = launch_browser(playwright)

        context = browser.new_context()
        first = open_clean_page(context, url)
        first.click("#btn-new-game")
        second = context.new_page()
        second.goto(url)
        second.click("#btn-continue-game")
        assert second.locator("#screen-setup").is_visible()

        first.locator("#player-list .text-input").first.fill("Anna from Tab A")
        assert second.locator("#storage-conflict-actions").is_visible()
        assert second.locator("#player-list .text-input").first.is_disabled()
        assert second.locator("#btn-export-conflict-state").is_enabled()
        context.close()

        quota_context = browser.new_context()
        quota_context.add_init_script(FAIL_WRITES_SCRIPT)
        quota = open_clean_page(quota_context, url)
        quota.click("#btn-new-game")
        quota.evaluate("window.__failGameWrites = true")
        quota.locator("#player-list .text-input").first.fill("Nicht saved")
        assert quota.locator("#storage-warning").is_visible()
        quota.click("#btn-setup-home")
        assert quota.locator("#btn-continue-game").is_enabled()
        quota_context.close()

        blocked_context = browser.new_context()
        blocked_context.add_init_script(BLOCK_STORAGE_SCRIPT)
        blocked = blocked_context.new_page()
        blocked.goto(url)
        blocked.click("#btn-new-game")
        assert blocked.locator("#storage-warning").is_visible()
        blocked.click("#btn-setup-home")
        assert blocked.locator("#btn-continue-game").is_enabled()
        blocked_context.close()
        browser.close()

    print("Browser multi-tab and storage-error tests passed.")


if __name__ == "__main__":
    main()
