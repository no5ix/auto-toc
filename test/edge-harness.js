"use strict";
// jsdom harness for the right-edge hover activation module inside auto_toc.js.
// The userscript must stay a single dependency-free file, so instead of requiring
// it we extract the module exactly, inject a small test seam before its closing
// statement, and evaluate it inside jsdom on a fixture that mirrors the edge drawer.

const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const SRC = fs.readFileSync(path.join(__dirname, "..", "auto_toc.js"), "utf8");
const MODULE_START = "(function initRightEdgeHoverActivation()";
const SEAM = `
    // ---- test-only seam (injected by the harness, never present in auto_toc.js) ----
    window.__edge = {
        settings: settings,
        constants: {
            STYLE_ID: STYLE_ID, ZONE_ID: ZONE_ID, ZONE_CLASS: ZONE_CLASS,
            OPEN_CLASS: OPEN_CLASS, EDGE_CLASS: EDGE_CLASS,
            MIN_WIDTH: MIN_WIDTH, MAX_WIDTH: MAX_WIDTH
        },
        getCss: getCss,
        install: install,
        sync: sync,
        attach: attach,
        detach: detach,
        destroy: destroy,
        open: open,
        closeNow: closeNow,
        scheduleClose: scheduleClose,
        cancelClose: cancelClose,
        state: function () {
            return {
                attached: !!attachedRoot,
                rootIsLive: !!attachedRoot && attachedRoot === document.getElementById("smarttoc"),
                zones: document.querySelectorAll("." + ZONE_CLASS).length,
                zoneBound: !!(attachedZone && attachedZone.dataset.autoTocEdgeBound === "1"),
                zoneWidth: attachedZone ? attachedZone.dataset.autoTocEdgeWidth : null,
                zoneVisibility: attachedZone ? (attachedZone.style.visibility || "visible") : null,
                open: !!(attachedRoot && attachedRoot.classList.contains(OPEN_CLASS)),
                closePending: closeTimer !== null,
                closeDelayMs: settings.closeDelayMs,
                observing: !!observer
            };
        }
    };
`;

function edgeModuleSource() {
    const start = SRC.indexOf(MODULE_START);
    if (start < 0) throw new Error("right-edge module start marker not found in auto_toc.js");
    const end = SRC.indexOf("\n})();", start);
    if (end < 0) throw new Error("right-edge module end marker not found in auto_toc.js");
    return SRC.slice(start, end) + "\n" + SEAM + "\n})();\n";
}

const FIXTURE_ROOT = `
<div id="smarttoc_wrapper">
  <div id="smarttoc" class="light octotree-edge">
    <div class="handle"><span class="handle-chevron">⌵</span><span class="handle-label"></span></div>
    <div class="toc-panel">
      <div class="toc-toolbar"><button type="button">📌</button></div>
      <ul class="toc-root-list"><li class="toc-row"><a href="#a">Alpha</a></li></ul>
    </div>
  </div>
</div>`;

// A page fixture: the edge drawer, plus a page element that stands in for the
// webpage content the pointer leaves for.
const PAGE = `<!doctype html><html><head></head><body>
<main id="article"><h2 id="a">Alpha</h2></main>
${FIXTURE_ROOT}
</body></html>`;

async function createPage(options) {
    const opts = options || {};
    const dom = new JSDOM(opts.html || PAGE, {
        runScripts: "dangerously",
        url: "https://chatgpt.com/",
        beforeParse(window) {
            const store = new Map();
            window.GM_getValue = function (key, fallback) { return store.has(key) ? store.get(key) : (fallback === undefined ? {} : fallback); };
            window.GM_setValue = function (key, value) { store.set(key, value); };
            // jsdom has no PointerEvent; boundary events are dispatched by the tests.
            window.PointerEvent = class PointerEvent extends window.MouseEvent {
                constructor(type, init) {
                    super(type, init);
                    this.pointerId = (init && init.pointerId !== undefined) ? init.pointerId : 1;
                    this.isPrimary = (init && init.isPrimary !== undefined) ? init.isPrimary : true;
                }
            };
            // jsdom performs no layout. Give the expanded panel the geometry it has in a
            // 1656x1000 viewport so the module's viewport-coordinate checks are exercised.
            const PANEL_BOX = { left: 1332, right: 1656, top: 0, bottom: 1000 };
            window.Element.prototype.getBoundingClientRect = function () {
                if (this.matches && this.matches(".toc-panel")) {
                    return { left: PANEL_BOX.left, right: PANEL_BOX.right, top: PANEL_BOX.top, bottom: PANEL_BOX.bottom, x: PANEL_BOX.left, y: PANEL_BOX.top, width: PANEL_BOX.right - PANEL_BOX.left, height: PANEL_BOX.bottom };
                }
                return { left: 0, right: 0, top: 0, bottom: 0, x: 0, y: 0, width: 0, height: 0 };
            };
            // Model the browser hit test: only the expanded panel covers the viewport edge.
            window.document.elementFromPoint = function (x, y) {
                const panel = window.document.querySelector("#smarttoc .toc-panel");
                const root = window.document.getElementById("smarttoc");
                if (panel && root && root.classList.contains("edge-hover-open") &&
                    x >= PANEL_BOX.left && x <= PANEL_BOX.right && y >= PANEL_BOX.top && y <= PANEL_BOX.bottom) {
                    return panel;
                }
                return window.document.body;
            };
        }
    });
    const window = dom.window;
    const script = window.document.createElement("script");
    script.textContent = edgeModuleSource();
    window.document.head.appendChild(script);

    const document = window.document;
    const runtime = {
        dom,
        window,
        document,
        edge: window.__edge,
        constants: window.__edge.constants,
        source: SRC,
        state() { return window.__edge.state(); },
        zones() { return Array.from(document.querySelectorAll("." + window.__edge.constants.ZONE_CLASS)); },
        root() { return document.getElementById("smarttoc"); },
        zone() { return this.zones()[0] || null; },
        handle() { return document.querySelector("#smarttoc .handle"); },
        panel() { return document.querySelector("#smarttoc .toc-panel"); },
        article() { return document.getElementById("article"); },
        // Boundary events are fired at the target element only and do not bubble.
        pointer(type, target, extra) {
            const init = Object.assign(
                { bubbles: false, cancelable: false, clientX: 1000, clientY: 300, relatedTarget: null },
                extra || {}
            );
            target.dispatchEvent(new window.PointerEvent(type, init));
        },
        enter(target, extra) { runtime.pointer("pointerenter", target, extra); },
        leave(target, extra) { runtime.pointer("pointerleave", target, extra); },
        move(target, extra) { runtime.pointer("pointermove", target, extra); },
        leave(target, extra) { runtime.pointer("pointerleave", target, extra); },
        // The SPA re-creates the drawer: drop it and mount a fresh one.
        remountTocRoot(pinned) {
            const wrapper = document.getElementById("smarttoc_wrapper");
            const old = document.getElementById("smarttoc");
            if (old) old.remove();
            wrapper.insertAdjacentHTML("beforeend", pinned
                ? FIXTURE_ROOT.replace("octotree-edge", "octotree-edge pinned")
                : FIXTURE_ROOT.trim());
            return document.getElementById("smarttoc");
        },
        sleep(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }
    };
    // The module installs on DOMContentLoaded when the document is still loading;
    // give that a turn so the observer and the zone exist before the first assertion.
    for (let i = 0; i < 20 && !window.__edge.state().attached; i++) {
        await new Promise(function (resolve) { setTimeout(resolve, 10); });
    }
    if (opts.closeDelayMs) window.__edge.settings.closeDelayMs = opts.closeDelayMs;
    return runtime;
}

module.exports = { createPage, edgeModuleSource, SRC, FIXTURE_ROOT };
