"""Native multi-tab, blocked-storage, and quota scenarios."""

import json
from pathlib import Path

from playwright.sync_api import sync_playwright
from browser_helpers import (
    launch_browser,
    open_clean_page,
    serve_app,
    set_values,
    start_game,
)

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

        # Service-worker lifecycle behavior is covered by browser-offline.py. Blocking workers here keeps
        # storage-event scenarios isolated from background controller changes and page reloads.
        context_options = {"service_workers": "block"}

        idle_context = browser.new_context(**context_options)
        idle = open_clean_page(idle_context, url)
        active = idle_context.new_page()
        active.goto(url)
        active.click("#btn-new-game")
        idle.locator("#btn-continue-game:not([disabled])").wait_for(state="attached")
        assert idle.locator("#screen-home").is_visible()
        assert idle.locator("#storage-conflict-actions").is_hidden()
        assert idle.locator("#storage-warning").is_hidden()
        assert idle.locator("#btn-continue-game").is_enabled()
        idle.click("#btn-continue-game")
        assert idle.locator("#screen-setup").is_visible()
        idle_context.close()

        context = browser.new_context(**context_options)
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
        assert second.locator("#btn-reload-after-conflict").is_visible()
        context.close()

        stale_finish_context = browser.new_context(**context_options)
        stale_finish = open_clean_page(stale_finish_context, url)
        start_game(stale_finish, rounds=1)
        set_values(stale_finish, ".bid-panel", (0, 0, 0))
        stale_finish.get_by_role("button", name="Confirm Bids").click()
        stale_finish.get_by_role("button", name="Enter Tricks").click()
        set_values(stale_finish, ".tricks-panel", (1, 0, 0))
        stale_finish.get_by_role("button", name="Complete Round").click()
        stale_finish.evaluate(
            """
            (() => {
              const externalState = WizardStorage.loadGame();
              externalState.players[0].name = "Name from another tab";
              externalState.updatedAt = new Date(
                Date.parse(externalState.updatedAt) + 1
              ).toISOString();
              localStorage.setItem(
                WizardStorage.STORAGE_KEY,
                JSON.stringify(externalState)
              );
            })()
            """
        )
        stale_finish.get_by_role("button", name="Finish Game").click()
        assert stale_finish.locator("#screen-game").is_visible()
        assert stale_finish.locator("#screen-finished").is_hidden()
        assert stale_finish.locator("#storage-conflict-actions").is_visible()
        assert stale_finish.locator("#btn-export-conflict-state").is_enabled()
        assert stale_finish.evaluate("WizardStorage.loadGameHistory().length") == 0
        assert stale_finish.evaluate(
            "WizardStorage.loadGame().players[0].name"
        ) == "Name from another tab"
        stale_finish_context.close()

        quota_context = browser.new_context(**context_options)
        quota_context.add_init_script(FAIL_WRITES_SCRIPT)
        quota = open_clean_page(quota_context, url)
        quota.evaluate("window.__failGameWrites = true")
        quota.click("#btn-new-game")
        assert quota.locator("#storage-warning").is_visible()
        assert quota.evaluate("localStorage.getItem(WizardStorage.STORAGE_KEY)") is None
        assert quota.locator("#storage-conflict-actions").is_visible()
        assert quota.locator("#btn-export-conflict-state").is_enabled()
        assert quota.locator("#btn-reload-after-conflict").is_hidden()
        with quota.expect_download() as quota_download_info:
            quota.click("#btn-export-conflict-state")
        quota_export = json.loads(
            Path(quota_download_info.value.path()).read_text(encoding="utf-8")
        )
        assert quota_export["recoveryReason"] == "unsaved-changes"
        assert quota_export["gameState"]["gameId"]

        # Retrying a failed initial write must not look like a stale tab recreating a deleted game.
        quota.evaluate("window.__failGameWrites = false")
        quota.locator("#player-list .text-input").first.fill("Recovered")
        assert quota.locator("#storage-conflict-actions").is_hidden()
        assert quota.locator("#storage-warning").is_hidden()
        assert quota.evaluate(
            "WizardStorage.loadGame().players[0].name"
        ) == "Recovered"
        quota_context.close()

        blocked_context = browser.new_context(**context_options)
        blocked_context.add_init_script(BLOCK_STORAGE_SCRIPT)
        blocked = blocked_context.new_page()
        blocked.goto(url)
        blocked.click("#btn-new-game")
        assert blocked.locator("#storage-warning").is_visible()
        assert blocked.locator("#storage-conflict-actions").is_visible()
        assert blocked.locator("#btn-export-conflict-state").is_enabled()
        assert blocked.locator("#btn-reload-after-conflict").is_hidden()
        blocked.locator("#player-list .text-input").first.fill("Keep me")
        blocked.click("#btn-setup-home")
        assert blocked.locator("#btn-continue-game").is_enabled()

        # An in-memory-only game still requires confirmation before it is replaced.
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
