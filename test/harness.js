"use strict";
// jsdom harness for the inline hold-to-translate (HTT) module inside auto_toc.js.
// The userscript must stay a single dependency-free file, so instead of requiring
// it we extract the HTT IIFE exactly, inject a small test seam before its closing
// statement, and evaluate it inside jsdom with stubbed userscript-manager APIs.

const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const SRC = fs.readFileSync(path.join(__dirname, "..", "auto_toc.js"), "utf8");
const MODULE_START = "(function initInlineHoldTranslation()";
const SEAM = `
    // ---- test-only seam (injected by the harness, never present in auto_toc.js) ----
    window.__htt = {
        getBlock: getBlock,
        getReadableBlockText: getReadableBlockText,
        settings: settings,
        holdState: function () { return { holdTimer: holdTimer, activePointer: activePointer, activeBlock: activeBlock, activeLine: activeLine }; },
        cancelActive: cancelActive
    };
`;

function httModuleSource() {
    const start = SRC.indexOf(MODULE_START);
    if (start < 0) throw new Error("HTT module start marker not found in auto_toc.js");
    const end = SRC.lastIndexOf("})();");
    if (end < start) throw new Error("HTT module end marker not found in auto_toc.js");
    // Keep the file valid even if code follows the module in the future: verify the
    // extracted chunk actually ends at a module boundary.
    const tail = SRC.slice(end);
    if (tail.trim() !== "})();") throw new Error("Unexpected text after HTT module end marker: " + JSON.stringify(tail.slice(0, 80)));
    return SRC.slice(start, end) + "\n" + SEAM + "\n})();\n";
}

// Canned Google translate_a/single payload used by the GM_xmlhttpRequest stub.
function fakeGoogleResponse(translation) {
    return JSON.stringify([[[translation, null, null, null]], null, "en"]);
}

async function createPage(options) {
    const opts = options || {};
    const translation = opts.translation || "译文";
    const requestLog = [];
    const dom = new JSDOM(
        '<!doctype html><html><head></head><body><main id="conv"></main></body></html>',
        {
            runScripts: "dangerously",
            url: "https://chatgpt.com/",
            beforeParse(window) {
                const store = new Map();
                window.GM_getValue = function (key, fallback) { return store.has(key) ? store.get(key) : fallback; };
                window.GM_setValue = function (key, value) { store.set(key, value); };
                // No GM_registerMenuCommand: the module must cope with its absence.
                window.GM_xmlhttpRequest = function (spec) {
                    requestLog.push({ url: spec.url, data: spec.data });
                    setTimeout(function () {
                        if (spec.onload) spec.onload({ status: 200, responseText: fakeGoogleResponse(translation) });
                    }, 0);
                    return { abort: function () { if (spec.onabort) spec.onabort(); } };
                };
                // jsdom has no PointerEvent; the module only reads pointerId/isPrimary/button.
                window.PointerEvent = class PointerEvent extends window.MouseEvent {
                    constructor(type, init) {
                        super(type, init);
                        this.pointerId = (init && init.pointerId !== undefined) ? init.pointerId : 1;
                        this.isPrimary = (init && init.isPrimary !== undefined) ? init.isPrimary : true;
                    }
                };
                // jsdom performs no layout: give every element a plausible box so the
                // module's sanity guards (width/height) behave like a real browser.
                Object.defineProperty(window.Element.prototype, "getBoundingClientRect", {
                    configurable: true,
                    writable: true,
                    value: function () { return { x: 0, y: 0, top: 0, left: 0, right: 400, bottom: 60, width: 400, height: 60 }; }
                });
                // elementFromPoint has no layout either; tests set the hit target.
                window.__hitTarget = null;
                window.document.elementFromPoint = function () { return window.__hitTarget; };
            }
        }
    );
    const window = dom.window;
    const script = window.document.createElement("script");
    script.textContent = httModuleSource();
    window.document.head.appendChild(script);
    const runtime = {
        dom,
        window,
        document: window.document,
        requestLog,
        htt: window.__htt,
        setHitTarget(el) { window.__hitTarget = el || null; },
        pointer(type, target, extra) {
            const init = Object.assign({ bubbles: true, cancelable: true, button: 0, clientX: 100, clientY: 20 }, extra || {});
            target.dispatchEvent(new window.PointerEvent(type, init));
        },
        translationLines() {
            return Array.from(window.document.querySelectorAll("[data-auto-toc-translation='true']"));
        },
        sleep(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }
    };
    // The module defers install() until DOMContentLoaded, which jsdom fires on a
    // later event-loop turn; wait until the install marker exists so pointer
    // listeners are registered before any test dispatches events.
    for (let i = 0; i < 20 && !window.document.getElementById("auto-toc-inline-translate-style"); i++) {
        await new Promise(function (resolve) { setTimeout(resolve, 10); });
    }
    if (!window.document.getElementById("auto-toc-inline-translate-style")) {
        throw new Error("HTT module did not install (style marker missing)");
    }
    // Fasten the default 280ms hold to the module floor (100ms) for tests.
    runtime.htt.settings.holdDelayMs = 60;
    return runtime;
}

module.exports = { createPage, httModuleSource };
