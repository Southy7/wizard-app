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
        quota.evaluate("window.__failGameWrites = true")
        quota.click("#btn-new-game")
        assert quota.locator("#storage-warning").is_visible()
        assert quota.evaluate("localStorage.getItem(WizardStorage.STORAGE_KEY)") is None

        # A later retry remains an explicit initial write and must not be
        # mistaken for a stale tab recreating a deleted game.
        quota.evaluate("window.__failGameWrites = false")
        quota.locator("#player-list .text-input").first.fill("Recovered")
        assert quota.locator("#storage-conflict-actions").is_hidden()
        assert quota.locator("#storage-warning").is_hidden()
        assert quota.evaluate(
            "WizardStorage.loadGame().players[0].name"
        ) == "Recovered"
        quota_context.close()

        blocked_context = browser.new_context()
        blocked_context.add_init_script(BLOCK_STORAGE_SCRIPT)
        blocked = blocked_context.new_page()
        blocked.goto(url)
        blocked.click("#btn-new-game")
        assert blocked.locator("#storage-warning").is_visible()
        blocked.locator("#player-list .text-input").first.fill("Keep me")
        blocked.click("#btn-setup-home")
        assert blocked.locator("#btn-continue-game").is_enabled()

        # Starting another game must ask before replacing a game that exists
        # only in memory after an initial storage failure.
        dialog_messages = []
        blocked.once(
            "dialog",
            lambda dialog: (dialog_messages.append(dialog.message), dialog.dismiss()),
        )
        blocked.click("#btn-new-game")
        assert dialog_messages and "A game already exists" in dialog_messages[0]
        assert blocked.locator("#screen-home").is_visible()
        blocked.click("#btn-continue-game")
        assert blocked.locator("#player-list .text-input").first.input_value() == "Keep me"
        blocked_context.close()
        browser.close()

    print("Browser multi-tab and storage-error tests passed.")


if __name__ == "__main__":
    main()
