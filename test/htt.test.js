"use strict";
// Regression tests for the inline hold-to-translate block resolution and gesture
// flow in auto_toc.js, focused on word-by-word span rendering (ChatGPT's
// data-d-text-flow="word" structure) and the sentence-sized unit contract.

const test = require("node:test");
const assert = require("node:assert/strict");
const { createPage } = require("./harness");

const SENTENCE_SPANS = ["Click", "the", "title", "bar", "twice,", "raising", "and", "focusing", "the", "window", "between", "clicks."];
const SENTENCE = "Click the title bar twice, raising and focusing the window between clicks.";

function wordSpanHtml(words, attrs) {
    const attrText = attrs ? " " + attrs : "";
    return words.map(function (w) { return '<span' + attrText + '>' + w + '</span>'; }).join(" ");
}

function mount(page, html) {
    page.document.getElementById("conv").innerHTML = html;
}

function spansIn(root) {
    return Array.from(root.querySelectorAll("span"));
}

test("word-level spans inside a plain container resolve to the whole sentence", async function (t) {
    const page = await createPage();
    mount(page, '<div class="wrap"><div class="label" data-d-list-item-content>' + wordSpanHtml(SENTENCE_SPANS, 'data-d-text-flow="word"') + "</div></div>");
    const target = spansIn(page.document)[3]; // the word "bar"
    const info = page.htt.getBlock(target);
    assert.ok(info, "getBlock must return a block for a word span");
    assert.equal(info.text, SENTENCE);
    assert.notEqual(info.block, target, "block must be the sentence container, not the hovered word span");
    assert.ok(info.block.contains(target));
    t.diagnostic("resolved block: <" + info.block.tagName.toLowerCase() + ">");
});

test("word-level spans in a generic heading wrapper translate as one sibling group", async function () {
    const page = await createPage();
    const heading = ["2.", "Open-source", "maintainers", "benefit", "disproportionately", "from", "memory", "safety"];
    mount(page, '<div class="heading-wrapper"><h2>' + wordSpanHtml(heading, 'data-d-text-flow="word"') + "</h2></div>");
    const spans = spansIn(page.document);
    // A real heading is a semantic block and must win over its inline spans.
    const headingInfo = page.htt.getBlock(spans[3]);
    assert.ok(headingInfo);
    assert.equal(headingInfo.block.tagName.toLowerCase(), "h2");
    assert.equal(headingInfo.text, "2. Open-source maintainers benefit disproportionately from memory safety");

    mount(page, '<div class="heading-wrapper">' + wordSpanHtml(heading, 'data-d-text-flow="word"') + "</div>");
    const genericSpans = spansIn(page.document);
    const info = page.htt.getBlock(genericSpans[3]);
    assert.ok(info);
    assert.equal(info.text, "2. Open-source maintainers benefit disproportionately from memory safety");
    assert.notEqual(info.block.tagName.toLowerCase(), "span");
    assert.equal(info.block.className, "heading-wrapper");
});

test("sibling inline children without ChatGPT-specific attributes are grouped", async function () {
    const page = await createPage();
    mount(page, '<div class="generic">' + wordSpanHtml(["Translate", "the", "complete", "sentence."], "") + "</div>");
    const info = page.htt.getBlock(spansIn(page.document)[2]);
    assert.ok(info);
    assert.equal(info.text, "Translate the complete sentence.");
    assert.equal(info.block.className, "generic");
});

test("word-level spans inside nested list-item wrappers resolve to the list item sentence", async function (t) {
    const page = await createPage();
    mount(page,
        '<ul>' +
        '<li class="Item-08JWQe" data-d-component="list-item">' +
        '<div class="Content-0KAHK6">' +
        '<div class="Label-B5tj_e" data-d-list-item-content>' +
        wordSpanHtml(SENTENCE_SPANS, 'data-d-text-flow="word"') +
        "</div></div></li></ul>");
    const span = spansIn(page.document)[8]; // the word "the"
    const info = page.htt.getBlock(span);
    assert.ok(info, "getBlock must return a block");
    assert.equal(info.text, SENTENCE);
    assert.equal(info.block.tagName.toLowerCase(), "li", "semantic <li> is the translation unit");
    t.diagnostic("li text: " + info.text);
});

test("punctuation and spacing survive span joins", async function (t) {
    const page = await createPage();
    const words = ["Send", "the", "report", "before", "5pm,", "on", "Friday."];
    mount(page, '<div class="label" data-d-list-item-content>' + wordSpanHtml(words, 'data-d-text-flow="word"') + "</div>");
    const info = page.htt.getBlock(spansIn(page.document)[1]); // "the"
    assert.ok(info);
    assert.equal(info.text, "Send the report before 5pm, on Friday.");
    assert.ok(!/\s{2,}/.test(info.text), "no doubled spacing");
    assert.ok(info.text.endsWith("Friday."), "sentence-ending punctuation preserved");
    t.diagnostic("text: " + info.text);
});

test("neighboring list items are never combined into one translation", async function (t) {
    const page = await createPage();
    const item1 = ["Rotate", "the", "monitor", "by", "ninety", "degrees."];
    const item2 = "Unrelated instruction that belongs to the second list item entirely.";
    mount(page,
        "<ul>" +
        '<li data-d-component="list-item"><div data-d-list-item-content>' + wordSpanHtml(item1, 'data-d-text-flow="word"') + "</div></li>" +
        "<li>" + item2 + "</li>" +
        "</ul>");
    const info = page.htt.getBlock(spansIn(page.document)[2]); // "monitor" in item 1
    assert.ok(info);
    assert.equal(info.text, "Rotate the monitor by ninety degrees.");
    assert.ok(!info.text.includes("Unrelated"), "second list item must not leak into the translation");
    t.diagnostic("unit: " + info.text);
});

test("multiple sentences inside one list item keep the existing paragraph-level semantics", async function (t) {
    const page = await createPage();
    const twoSentences = "Hold the pointer steady here. The next sentence stays in the same item.";
    const otherItem = "A separate item with its own instruction.";
    mount(page, "<ul><li>" + twoSentences + "</li><li>" + otherItem + "</li></ul>");
    const info = page.htt.getBlock(page.document.querySelector("li").firstChild);
    assert.ok(info);
    assert.equal(info.text, twoSentences, "whole block (both sentences of the item) translates together, like a paragraph");
    assert.ok(!info.text.includes("separate item"), "but sibling items are never merged");
});

test("ordinary paragraph text keeps working unchanged", async function (t) {
    const page = await createPage();
    mount(page, "<p>The quick brown fox jumps over the lazy dog near the river bank.</p>" +
        '<p>Please <strong>open</strong> the <a href="https://example.com">documentation</a> before Friday.</p>');
    const simple = page.htt.getBlock(page.document.querySelector("p").firstChild);
    assert.ok(simple);
    assert.equal(simple.text, "The quick brown fox jumps over the lazy dog near the river bank.");
    const mixed = page.htt.getBlock(page.document.querySelectorAll("p")[1].querySelector("strong").firstChild);
    assert.ok(mixed);
    assert.equal(mixed.text, "Please open the documentation before Friday.");
    assert.equal(mixed.block.tagName.toLowerCase(), "p");
});

test("pointer deep inside a word span still yields the complete sentence block", async function (t) {
    const page = await createPage();
    mount(page,
        '<li data-d-component="list-item"><div><div data-d-list-item-content>' +
        wordSpanHtml(SENTENCE_SPANS, 'data-d-text-flow="word"') +
        "</div></div></li>");
    const deepText = spansIn(page.document)[5].firstChild; // TEXT node inside a word span
    const info = page.htt.getBlock(deepText);
    assert.ok(info);
    assert.equal(info.text, SENTENCE);
    assert.notEqual(info.block.tagName.toLowerCase(), "span", "never translate a single word span");
});

test("word-level spans inside a paragraph resolve to the whole paragraph", async function (t) {
    const page = await createPage();
    mount(page, '<p>' + wordSpanHtml(SENTENCE_SPANS, 'data-d-text-flow="word"') + "</p>");
    const info = page.htt.getBlock(spansIn(page.document)[0]);
    assert.ok(info);
    assert.equal(info.text, SENTENCE);
    assert.equal(info.block.tagName.toLowerCase(), "p");
});

test("AutoTOC-owned and interactive regions are ignored", async function (t) {
    const page = await createPage();
    mount(page, '<div id="smarttoc"><p>This heading lives inside the table of contents drawer.</p></div>' +
        '<button>Press this button label to submit the form now</button>');
    assert.equal(page.htt.getBlock(page.document.querySelector("#smarttoc p").firstChild), null);
    assert.equal(page.htt.getBlock(page.document.querySelector("button").firstChild), null);
});

test("hold gesture translates the full sentence and inserts exactly one inline line", async function (t) {
    const page = await createPage({ translation: "双击标题栏…" });
    mount(page,
        '<ul><li data-d-component="list-item"><div data-d-list-item-content>' +
        wordSpanHtml(SENTENCE_SPANS, 'data-d-text-flow="word"') +
        "</div></li></ul>");
    const span = spansIn(page.document)[4]; // "twice,"
    page.setHitTarget(span);
    page.pointer("pointerdown", span);
    await page.sleep(180);
    page.pointer("pointerup", span);
    await page.sleep(30); // let the stubbed provider round-trip settle
    const lines = page.translationLines();
    assert.equal(lines.length, 1, "exactly one translation line injected");
    assert.equal(lines[0].textContent, "双击标题栏…");
    assert.equal(lines[0].previousElementSibling.tagName.toLowerCase(), "li", "translation sits after the sentence block, not after a word span");
    assert.equal(page.requestLog.length, 1);
    assert.ok(decodeURIComponent(page.requestLog[0].url).includes(SENTENCE), "provider receives the full sentence");
});

test("translation result is cached: a repeat hold does not refetch the same sentence", async function (t) {
    const page = await createPage();
    mount(page, '<div data-d-list-item-content>' + wordSpanHtml(SENTENCE_SPANS, 'data-d-text-flow="word"') + "</div>");
    const span = spansIn(page.document)[2];
    page.setHitTarget(span);
    for (let i = 0; i < 2; i++) {
        page.pointer("pointerdown", span);
        await page.sleep(180);
        page.pointer("pointerup", span);
        await page.sleep(30);
    }
    const lines = page.translationLines();
    assert.equal(lines.length, 1, "repeat gesture reuses the same inline line");
    assert.equal(page.requestLog.length, 1, "second gesture answered from cache");
});

test("movement, early release and cancellation suppress translation without leftovers", async function (t) {
    const page = await createPage();
    mount(page, '<div data-d-list-item-content>' + wordSpanHtml(SENTENCE_SPANS, 'data-d-text-flow="word"') + "</div>");
    const span = spansIn(page.document)[6]; // "and"
    page.setHitTarget(span);

    // Drag past the 4px threshold cancels the pending hold.
    page.pointer("pointerdown", span);
    page.pointer("pointermove", span, { clientX: 118 });
    await page.sleep(180);
    page.pointer("pointerup", span);
    assert.equal(page.htt.holdState().holdTimer, null, "move cancels pending timer");

    // Release before the hold delay elapses never translates.
    page.pointer("pointerdown", span);
    await page.sleep(40);
    page.pointer("pointerup", span);
    await page.sleep(180);
    assert.equal(page.htt.holdState().activePointer, null);

    // pointercancel clears state.
    page.pointer("pointerdown", span);
    page.pointer("pointercancel", span);
    assert.equal(page.htt.holdState().activePointer, null, "pointercancel clears the pointer");

    // Escape clears active state too.
    page.pointer("pointerdown", span);
    page.document.dispatchEvent(new page.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    assert.equal(page.htt.holdState().activePointer, null, "Escape cancels");
    await page.sleep(30);
    assert.equal(page.translationLines().length, 0, "no suppressed gesture left a translation behind");
    assert.equal(page.requestLog.length, 0, "no provider call was made");
});
