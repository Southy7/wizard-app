"""Gemeinsame Browser-Testhilfen mit echtem HTTP-Origin und nativem localStorage."""

from contextlib import contextmanager
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
import shutil

ROOT = Path(__file__).resolve().parents[1]


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, _format, *_args):
        return


@contextmanager
def serve_app():
    handler = partial(QuietHandler, directory=ROOT)
    server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.server_port}/index.html"
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)


def launch_browser(playwright):
    options = {"headless": True}
    chromium_path = shutil.which("chromium") or shutil.which("chromium-browser")
    if chromium_path:
        options["executable_path"] = chromium_path
        options["args"] = ["--no-sandbox"]
    return playwright.chromium.launch(**options)


def open_clean_page(context, url):
    page = context.new_page()
    page.goto(url)
    page.evaluate("localStorage.clear()")
    page.reload()
    return page


def start_game(page, rounds=1):
    page.click("#btn-new-game")
    page.click("#btn-round-mode-individual")
    for index, name in enumerate(("Anna", "Ben", "Chris")):
        page.locator("#player-list .text-input").nth(index).fill(name)
    page.fill("#rounds-input", str(rounds))
    page.dispatch_event("#rounds-input", "change")
    page.click("#setup-form button[type=submit]")
    page.click("#btn-summary-start")
    if page.locator("#round-one-dialog").is_visible():
        page.click("#btn-confirm-round-one-hint")
    assert_persisted(page)


def set_values(page, panel_selector, values):
    rows = page.locator(f"{panel_selector} .entry-row")
    for index, target in enumerate(values):
        plus = rows.nth(index).locator(".value-button").nth(1)
        for _ in range(target):
            plus.click()
            assert_persisted(page)


def assert_persisted(page):
    result = page.evaluate(
        """
        (() => ({
          readable: WizardStorage.loadGame() !== null,
          gameError: WizardStorage.getStorageErrors().gameError
        }))()
        """
    )
    assert result["readable"], "Der aktuelle UI-Zustand ist nicht mehr aus localStorage lesbar."
    assert result["gameError"] == "", result["gameError"]
    assert page.locator("#storage-warning").is_hidden()

