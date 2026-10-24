import fs from "node:fs";
import vm from "node:vm";

const path = process.argv[2] || "tools/auto-toc-current.js";
const source = fs.readFileSync(path, "utf8");
new vm.Script(source, { filename: path });
const version = source.match(/^\/\/ @version\s+(.+)$/m)?.[1]?.trim();
const checks = [
  ["standalone handle mounted under body", source.includes("document.body.appendChild(handleElement)")],
  ["old nested handle render removed", !source.includes("[mithril(handle), mithril(toc)]")],
  ["independent handle CSS exists", source.includes("#smarttoc-edge-handle {")],
  ["pointer moves captured on window", source.includes('window.addEventListener("pointermove", moveDrag, true)') && source.includes('state.startTop + state.latestY - state.startY')],
  ["drag offset persisted", source.includes('GM_setValue(STORAGE_KEY, Math.round(top))')],
  ["drawer hover class connected", source.includes(".edge-handle-hover:not(.pinned) .toc-panel")],
  ["drag always clears drawer hover state", source.includes('rootElement.classList.remove("edge-handle-hover")') && source.includes("if (dragState) {")],
  ["hover sync ignores active drag", source.includes("if (!rootElement || dragState) return;")],
  ["standalone handle has drag grip", source.includes("handle-drag-grip")],
];
for (const [label, ok] of checks) console.log((ok ? "PASS" : "FAIL") + " " + label);
if (checks.some(([, ok]) => !ok)) process.exitCode = 1;
console.log("Parsed userscript version:", version || "unknown");
