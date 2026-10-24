import fs from "node:fs";
import vm from "node:vm";

const path = process.argv[2] || "auto_toc.js";
const source = fs.readFileSync(path, "utf8");
new vm.Script(source, { filename: path });
const version = source.match(/^\/\/ @version\s+(.+)$/m)?.[1]?.trim();
const checks = [
  ["standalone handle mounted under body", source.includes("document.body.appendChild(handleElement)")],
  ["old nested handle render removed", !source.includes("[mithril(handle), mithril(toc)]")],
  ["independent handle CSS exists", source.includes("#smarttoc-edge-handle {")],
  ["pointer moves captured on window", source.includes('window.addEventListener("pointermove", moveDrag, true)')],
  ["drag offset persisted", source.includes('GM_setValue(STORAGE_KEY, Math.round(top))')],
  ["drawer hover class connected", source.includes(".edge-handle-hover:not(.pinned) .toc-panel")],
];
for (const [label, ok] of checks) console.log((ok ? "PASS" : "FAIL") + " " + label);
if (checks.some(([, ok]) => !ok)) process.exitCode = 1;
console.log("Parsed userscript version:", version || "unknown");
