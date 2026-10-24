
// @ts-check
import fs from "node:fs";
import vm from "node:vm";

const path = process.argv[2] || "auto_toc.js";
const source = fs.readFileSync(path, "utf8");
new vm.Script(source, { filename: path });
const version = source.match(/^\/\/ @version\s+(.+)$/m)?.[1]?.trim();
const checks = [
  ["full userscript closure is present", source.trimEnd().endsWith("})();")],
  ["standalone handle is appended to body", source.includes("document.body.appendChild(handleElement)")],
  ["standalone handle has visible CSS", source.includes("#smarttoc-edge-handle {") && source.includes("display: flex !important")],
  ["handle stays above page content", source.includes("z-index: 2147483647 !important")],
  ["mount waits for TOC root when needed", source.includes("rootObserver.observe(document.documentElement, { childList: true, subtree: true })")],
  ["drag suppression is retained", source.includes('rootElement.classList.remove("edge-handle-hover")') && source.includes("if (dragState) {")],
  ["drag position is persisted", source.includes('GM_setValue(STORAGE_KEY, Math.round(top))')],
];
for (const [label, ok] of checks) console.log((ok ? "PASS" : "FAIL") + " " + label);
if (checks.some(([, ok]) => !ok)) process.exitCode = 1;
console.log("Parsed userscript version:", version || "unknown");
