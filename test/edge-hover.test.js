"use strict";
// Regression tests for the right-edge hover activation module in auto_toc.js:
// the viewport-edge strip, the open/closing state machine, the grace delay and
// timer cancellation, and the SPA re-attach / cleanup behaviour.

const test = require("node:test");
const assert = require("node:assert/strict");
const { createPage, SRC } = require("./edge-harness");

const FAST = 40;

test("install mounts exactly one transparent strip into the edge drawer", async function (t) {
    const page = await createPage();
    const state = page.state();
    assert.equal(state.attached, true, "module must attach to #smarttoc");
    assert.equal(state.rootIsLive, true);
    assert.equal(state.zones, 1, "exactly one activation element");
    assert.equal(state.zoneBound, true, "listeners must be bound once");

    const zone = page.zone();
    assert.equal(zone.getAttribute("aria-hidden"), "true", "the strip is decorative");
    assert.equal(zone.getAttribute("data-auto-toc-edge-activation"), "true");
    const width = Number.parseInt(zone.dataset.autoTocEdgeWidth, 10);
    assert.ok(width >= 12 && width <= 16, "activation zone must be 12-16 CSS px, got " + width);
    assert.ok(zone.parentElement.id === "smarttoc", "the strip lives inside the drawer root");
    t.diagnostic("zone width: " + zone.dataset.autoTocEdgeWidth);
});

test("the strip CSS is a full-height, viewport-anchored, transparent hit area", async function () {
    const page = await createPage();
    const css = page.edge.getCss();
    const rule = css.replace(/\s+/g, " ");
    // Anchored to the drawer root (which is fixed to the viewport), not to screen px.
    assert.match(rule, /position: absolute/);
    assert.match(rule, /top: 0/);
    assert.match(rule, /bottom: 0/);
    assert.match(rule, /right: 0/);
    assert.doesNotMatch(rule, /100vw|screenX|window\.innerWidth/, "no fixed browser dimensions");
    assert.match(rule, /width: var\(--autotoc-edge-width/);
    assert.match(rule, /min-width: 12px/);
    assert.match(rule, /max-width: 16px/);
    assert.match(rule, /background: transparent/);
    assert.match(rule, /touch-action: pan-y/, "touch panning must stay available");
    // Active only while closed, inert while the panel is expanded.
    assert.match(rule, /pointer-events: auto/);
    assert.match(rule, /\.edge-hover-open \.edge-activation-zone[^{]*\{[^}]*pointer-events: none/);
    assert.match(rule, /\.pinned \.edge-activation-zone/);
    assert.match(rule, /has\(\.toc-panel:hover\) \.edge-activation-zone/);

    // The stylesheet is injected once, with a stable id.
    const style = page.document.getElementById(page.constants.STYLE_ID);
    assert.ok(style, "style element must be present");
    assert.equal(style.textContent, css);
});

test("the drawer opens on the module class in the shipped stylesheet", async function () {
    // The visible panel/handle CSS is owned by getTocCss(); the module only flips a
    // class, so the open rules must be wired there.
    const flat = SRC.replace(/\s+/g, " ");
    assert.match(flat, /#smarttoc\.octotree-edge\.edge-hover-open,\s*#smarttoc\.octotree-edge:focus-within/);
    assert.match(flat, /\.edge-hover-open \.toc-panel,[^}]*transform:translateX\(0\)[^}]*pointer-events:auto/);
    assert.match(flat, /\.edge-hover-open \.handle,[^}]*opacity:0/);
    // ...including the narrow-viewport override.
    assert.match(flat, /@media \(max-width: 520px\)[^{]*\{[^@]*\.edge-hover-open/);
});

test("entering the strip opens the drawer", async function () {
    const page = await createPage();
    assert.equal(page.state().open, false, "closed before the pointer arrives");
    page.enter(page.zone());
    const state = page.state();
    assert.equal(state.open, true, "pointer at the viewport edge opens the drawer");
    assert.equal(state.closePending, false);
});

test("moving between strip, handle and panel never schedules a close", async function () {
    const page = await createPage({ closeDelayMs: FAST });
    page.enter(page.zone());
    assert.equal(page.state().open, true);

    // strip -> panel
    page.leave(page.zone(), { relatedTarget: page.panel() });
    page.enter(page.panel());
    let state = page.state();
    assert.equal(state.closePending, false, "no close scheduled inside the drawer");
    assert.equal(state.open, true);

    // panel -> handle
    page.leave(page.panel(), { relatedTarget: page.handle() });
    page.enter(page.handle());
    state = page.state();
    assert.equal(state.closePending, false);
    assert.equal(state.open, true);

    // panel -> strip
    page.leave(page.panel(), { relatedTarget: page.zone() });
    page.enter(page.zone());
    state = page.state();
    assert.equal(state.closePending, false);
    assert.equal(state.open, true);

    await page.sleep(FAST * 3);
    assert.equal(page.state().open, true, "must stay open while the pointer moves inside");
});

test("leaving both the strip and the panel closes the drawer after the delay", async function () {
    const page = await createPage({ closeDelayMs: FAST });
    page.enter(page.zone());
    page.leave(page.zone(), { relatedTarget: page.article() });

    const grace = page.state();
    assert.equal(grace.closePending, true, "closing is scheduled, not instant");
    assert.equal(grace.open, true, "drawer stays open during the grace delay");
    assert.equal(grace.zoneVisibility, "hidden", "strip is disarmed while the panel is open");

    await page.sleep(FAST * 3);
    const after = page.state();
    assert.equal(after.open, false, "drawer closed after the grace delay");
    assert.equal(after.closePending, false);
    assert.equal(after.zoneVisibility, "visible", "strip is re-armed for the next activation");
});

test("the shipped closing delay is 300-500 ms", async function () {
    const page = await createPage();
    const delay = page.edge.settings.closeDelayMs;
    assert.ok(delay >= 300 && delay <= 500, "closeDelayMs must be 300-500ms, got " + delay);
});

test("re-entering during the grace window cancels the pending close", async function () {
    const page = await createPage({ closeDelayMs: FAST });
    page.enter(page.zone());
    page.leave(page.zone(), { relatedTarget: page.article() });
    assert.equal(page.state().closePending, true);

    page.enter(page.zone());
    const state = page.state();
    assert.equal(state.closePending, false, "pending timer cancelled immediately");
    assert.equal(state.open, true);
    assert.equal(state.zoneVisibility, "visible");

    await page.sleep(FAST * 3);
    assert.equal(page.state().open, true, "no flicker: drawer is still open");
});

test("a click inside the drawer keeps it open", async function () {
    const page = await createPage({ closeDelayMs: FAST });
    page.enter(page.zone());
    page.leave(page.panel(), { relatedTarget: page.article() });
    assert.equal(page.state().closePending, true);
    page.pointer("pointerdown", page.panel().querySelector("button"));
    assert.equal(page.state().closePending, false);
    assert.equal(page.state().open, true);
});

test("a pinned drawer is never closed by the pointer leaving", async function () {
    const page = await createPage({ closeDelayMs: FAST });
    page.root().classList.add("pinned");
    page.enter(page.zone());
    page.leave(page.zone(), { relatedTarget: page.article() });
    const state = page.state();
    assert.equal(state.closePending, false, "pinned drawer must not auto-close");
    assert.equal(page.root().classList.contains("pinned"), true);
});

test("SPA re-mounts keep one strip and drop listeners on the retired root", async function (t) {
    const page = await createPage({ closeDelayMs: FAST });
    page.edge.sync();
    page.edge.sync();
    assert.equal(page.state().zones, 1, "repeated sync must not duplicate the strip");

    const retired = page.root();
    const fresh = page.remountTocRoot();
    page.edge.sync();

    const state = page.state();
    assert.equal(state.attached, true);
    assert.equal(state.rootIsLive, true, "module follows the live root");
    assert.equal(page.zones().length, 1, "one strip in the new drawer");
    assert.equal(page.zones()[0].parentElement, fresh);
    assert.equal(state.zoneBound, true);

    // The retired root must no longer react.
    page.enter(retired.querySelector(".handle"));
    assert.equal(retired.classList.contains(page.constants.OPEN_CLASS), false);
    assert.equal(page.state().open, false);
    t.diagnostic("retired root detached, live root re-attached");
});

test("a drawer without the edge layout is left alone", async function () {
    const page = await createPage({
        html: `<!doctype html><html><head></head><body><main id="article"><h2>a</h2></main>
        <div id="smarttoc_wrapper"><div id="smarttoc" class="light"></div></div></body></html>`,
    });
    const state = page.state();
    assert.equal(state.attached, false, "legacy (non octotree-edge) layout is ignored");
    assert.equal(state.zones, 0);
});

test("the activation width setting is clamped to the documented band", async function () {
    const page = await createPage();
    page.edge.settings.widthPx = 400;
    page.edge.sync();
    assert.equal(page.zone().dataset.autoTocEdgeWidth, "16px");
    page.edge.settings.widthPx = 3;
    page.edge.sync();
    assert.equal(page.zone().dataset.autoTocEdgeWidth, "12px");
    page.edge.settings.widthPx = 15;
    page.edge.sync();
    assert.equal(page.zone().dataset.autoTocEdgeWidth, "15px");
});

test("a re-render under a stationary pointer does not close the drawer", async function () {
    const page = await createPage({ closeDelayMs: FAST });
    page.enter(page.zone());
    assert.equal(page.state().open, true);
    // Mithril swaps the element under the pointer: pointerleave with no relatedTarget,
    // at a point that is still inside the expanded panel.
    page.leave(page.panel(), { relatedTarget: null, clientX: 1500, clientY: 400 });
    const state = page.state();
    assert.equal(state.closePending, false, "in-panel leave must not start the closing timer");
    assert.equal(state.open, true);
    await page.sleep(FAST * 3);
    assert.equal(page.state().open, true, "drawer survived the re-render");
});

test("the Chrome positionless re-render leave does not close the drawer", async function () {
    const page = await createPage({ closeDelayMs: FAST });
    page.enter(page.zone());
    // The pointer genuinely moved inside the panel, so its real position is known.
    page.move(page.panel(), { clientX: 1500, clientY: 400 });
    // Chrome's artifact leave: no relatedTarget and 0,0 coordinates.
    page.leave(page.root(), { relatedTarget: null, clientX: 0, clientY: 0 });
    const state = page.state();
    assert.equal(state.closePending, false, "positionless leave over the drawer must not close it");
    await page.sleep(FAST * 3);
    assert.equal(page.state().open, true);
});

test("a real pointer exit is not rescued by the artifact guard", async function () {
    const page = await createPage({ closeDelayMs: FAST });
    page.enter(page.zone());
    page.move(page.panel(), { clientX: 1500, clientY: 400 });
    // The pointer moved out of the drawer and onto the article: a real leave.
    page.move(page.article(), { clientX: 400, clientY: 400 });
    page.leave(page.panel(), { relatedTarget: page.article(), clientX: 1331, clientY: 400 });
    assert.equal(page.state().closePending, true);
    await page.sleep(FAST * 3);
    assert.equal(page.state().open, false);
});

test("a leave whose coordinates are outside the panel still closes the drawer", async function () {
    const page = await createPage({ closeDelayMs: FAST });
    page.enter(page.zone());
    page.leave(page.panel(), { relatedTarget: null, clientX: 400, clientY: 400 });
    assert.equal(page.state().closePending, true, "leaving the panel area schedules the close");
    await page.sleep(FAST * 3);
    assert.equal(page.state().open, false);
});

test("destroy tears down listeners, timers, class and stylesheet", async function () {
    const page = await createPage({ closeDelayMs: FAST });
    page.enter(page.zone());
    page.leave(page.zone(), { relatedTarget: page.article() });
    assert.equal(page.state().closePending, true);

    page.edge.destroy();
    const state = page.state();
    assert.equal(state.observing, false, "observer disconnected");
    assert.equal(state.attached, false);
    assert.equal(state.closePending, false, "timer cleared");
    assert.equal(state.open, false, "open class removed from the drawer");
    assert.equal(page.document.getElementById(page.constants.STYLE_ID), null, "style removed");

    // Listeners are gone: entering again must not re-open anything.
    page.enter(page.zone());
    page.pointer("pointerdown", page.zone());
    assert.equal(page.root().classList.contains(page.constants.OPEN_CLASS), false);
});

test("a second userscript injection does not install a second observer", async function () {
    const page = await createPage();
    const before = page.state();
    const window = page.window;
    const script = window.document.createElement("script");
    script.textContent = require("./edge-harness").edgeModuleSource();
    window.document.head.appendChild(script);

    const state = page.state();
    assert.equal(state.zones, before.zones, "no duplicate activation element");
    assert.equal(state.attached, true);
});
