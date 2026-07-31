#!/usr/bin/env python3
"""Browser acceptance tests for the production Logbook frontend.

The caller must build and serve the Docker frontend first. The suite deliberately
fails on console errors, page errors, failed requests, or HTTP responses >= 400.
Screenshots are written for Explore, Functions, function editing, and Events.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import time
import uuid
from pathlib import Path
from typing import Callable

from playwright.sync_api import Page, sync_playwright


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default=os.environ.get("E2E_BASE_URL", "http://127.0.0.1:8790"))
    parser.add_argument("--output", default=os.environ.get("E2E_SCREENSHOT_DIR", "frontend/test-results/screenshots"))
    parser.add_argument("--headed", action="store_true")
    return parser.parse_args()


def install_failure_guards(page: Page) -> tuple[list[str], Callable[[], None]]:
    failures: list[str] = []
    page.on("console", lambda message: failures.append(f"console {message.type}: {message.text}") if message.type == "error" else None)
    page.on("pageerror", lambda error: failures.append(f"pageerror: {error}"))
    page.on("requestfailed", lambda request: failures.append(f"requestfailed: {request.method} {request.url}: {request.failure}"))
    page.on("response", lambda response: failures.append(f"http {response.status}: {response.url}") if response.status >= 400 else None)

    def assert_clean() -> None:
        if failures:
            raise AssertionError("Browser/network failures:\n" + "\n".join(failures))

    return failures, assert_clean


def assert_normal_layout(page: Page) -> None:
    page.locator("header.topbar").wait_for(state="visible")
    page.get_by_role("navigation", name="Main navigation").wait_for(state="visible")
    page.get_by_role("link", name=re.compile("Home Logbook", re.I)).wait_for(state="visible")


def screenshot(page: Page, output: Path, name: str) -> None:
    page.screenshot(path=str(output / name), full_page=True)


def wait_for_udf_declaration_state(page: Page, state: str) -> None:
    root = page.locator(".logbook-analysis-editor").first
    deadline = time.time() + 10
    while time.time() < deadline:
        if root.get_attribute("data-udf-declaration") == state:
            return
        page.wait_for_timeout(50)
    raise AssertionError(f"The generated udf object did not become {state}")


def assert_only_udf_declaration_hidden(page: Page) -> None:
    root = page.locator(".logbook-analysis-editor").first
    root.wait_for(state="visible", timeout=30_000)
    state = root.get_attribute("data-udf-declaration")
    visible_editor_text = page.locator(".monaco-editor .view-lines").first.inner_text()
    assert "function " in visible_editor_text, "The generated function signature must remain visible"
    if state == "absent":
        assert page.get_by_label("Show generated udf object").count() == 0
        return
    toggle = page.get_by_label("Show generated udf object").first
    assert not toggle.is_checked(), "The generated udf object must be hidden by default"
    wait_for_udf_declaration_state(page, "hidden")
    toggle.check()
    wait_for_udf_declaration_state(page, "visible")
    toggle.uncheck()
    wait_for_udf_declaration_state(page, "hidden")


def replace_monaco(page: Page, source: str, settle_ms: int = 600) -> None:
    toggle = page.get_by_label("Show generated udf object")
    if toggle.count() and toggle.first.is_checked():
        toggle.first.uncheck()
    editor = page.locator(".monaco-editor").first
    editor.wait_for(state="visible", timeout=30_000)
    editor.click()
    page.keyboard.press("Control+A")
    page.wait_for_timeout(50)
    page.keyboard.type(source)
    if settle_ms:
        page.wait_for_timeout(settle_ms)


def assert_monaco_features(page: Page) -> None:
    assert_only_udf_declaration_hidden(page)
    editor = page.locator(".monaco-editor").first
    editor.wait_for(state="visible", timeout=30_000)
    assert page.locator(".monaco-editor .mtk1, .monaco-editor [class*='mtk']").count() > 0, "Monaco syntax tokens did not render"

    editor.click()
    page.keyboard.press("Control+K")
    page.keyboard.press("Control+I")
    page.locator(".monaco-hover").wait_for(state="visible", timeout=10_000)
    page.keyboard.press("Escape")

    replace_monaco(page, "return missingAnalysisName;")
    page.get_by_text(re.compile(r"[1-9]\d* errors")).wait_for(timeout=15_000)
    assert page.locator(".squiggly-error, .squiggly-inline-error").count() > 0, "Monaco diagnostics did not render"

    replace_monaco(page, "return val")
    page.keyboard.press("Control+Space")
    page.locator(".suggest-widget.visible").wait_for(state="visible", timeout=10_000)
    page.keyboard.press("Escape")


def run() -> None:
    args = parse_args()
    base_url = args.base_url.rstrip("/")
    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=True)

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=not args.headed)
        context = browser.new_context(viewport={"width": 1600, "height": 1050})
        page = context.new_page()
        failures, assert_clean = install_failure_guards(page)

        # Existing page regression screenshot and layout assertion.
        page.goto(f"{base_url}/events", wait_until="networkidle")
        assert_normal_layout(page)
        screenshot(page, output, "existing-events-page.png")
        assert_clean()
        failures.clear()

        # Function catalog and creation/editing in the normal application shell.
        page.goto(f"{base_url}/analysis-functions", wait_until="networkidle")
        assert_normal_layout(page)
        page.get_by_role("heading", name="Analysis functions").wait_for()
        screenshot(page, output, "analysis-functions.png")

        suffix = uuid.uuid4().hex[:8]
        page.get_by_placeholder("Name").fill(f"E2E Normalize {suffix}")
        page.get_by_placeholder("stable-key").fill(f"e2e_normalize_{suffix}")
        page.locator(".analysis-create-row select").select_option("point-map")
        page.get_by_role("button", name="Create").click()
        page.wait_for_url(re.compile(r"/analysis-functions/[^/]+$"), timeout=20_000)
        assert_normal_layout(page)
        page.get_by_role("heading", name=re.compile("E2E Normalize")).wait_for()
        assert_monaco_features(page)
        replace_monaco(page, "return (value ?? 0) * 2;")
        page.get_by_text("0 errors").wait_for(timeout=15_000)
        page.get_by_role("button", name="Save revision").click()
        publish_button = page.get_by_role("button", name="Publish")
        deadline = time.time() + 20
        while time.time() < deadline and not publish_button.is_enabled():
            page.wait_for_timeout(250)
        assert publish_button.is_enabled(), "Saved UDF revision did not become publishable"
        publish_button.click()
        page.wait_for_load_state("networkidle")
        screenshot(page, output, "analysis-function-edit.png")
        assert_clean()
        failures.clear()

        # Explore layout, saved-UDF autocomplete, Monaco, execution, and renderer response to source edits.
        page.goto(f"{base_url}/explore/new", wait_until="networkidle")
        assert_normal_layout(page)
        page.get_by_role("button", name="Code").click()
        page.locator(".monaco-editor").wait_for(state="visible", timeout=30_000)
        assert_only_udf_declaration_hidden(page)
        page.get_by_text("Show generated udf object", exact=True).wait_for()

        saved_udf_key = f"e2e_normalize_{suffix}"
        replace_monaco(page, "return udf.")
        page.keyboard.press("Control+Space")
        page.locator(".suggest-widget.visible").wait_for(state="visible", timeout=10_000)
        page.locator(".suggest-widget.visible").get_by_text(saved_udf_key, exact=True).wait_for(timeout=10_000)
        page.keyboard.press("Escape")

        replace_monaco(page, "return event.values();")
        page.get_by_role("button", name="Run", exact=True).click()
        chart = page.locator(".analysis-chart").first
        chart.wait_for(state="visible", timeout=30_000)
        baseline_values = chart.get_attribute("data-analysis-values")
        assert baseline_values is not None, "The series renderer did not expose plotted values for verification"

        # Click Run immediately after editing. This catches execution of a stale debounced source body.
        replace_monaco(page, "return event.values().map((value, point, index, options) => value * 1000);", settle_ms=0)
        page.get_by_role("button", name="Run", exact=True).click()
        deadline = time.time() + 30
        baseline = json.loads(baseline_values)
        assert any(value is not None for value in baseline), "The selected event series has no numeric values to transform"
        expected = [None if value is None else value * 1000 for value in baseline]
        changed = False
        while time.time() < deadline:
            page.wait_for_timeout(200)
            current = chart.get_attribute("data-analysis-values")
            if current is not None and json.loads(current) == expected:
                changed = True
                break
        assert changed, "NumericSeries.map did not multiply the plotted point values by 1000"
        screenshot(page, output, "explore-map-points-output.png")
        assert_clean()

        browser.close()


if __name__ == "__main__":
    run()
