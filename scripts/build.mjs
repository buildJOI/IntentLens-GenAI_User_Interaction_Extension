import * as esbuild from "esbuild";
import { mkdir, copyFile, writeFile, readFile, access } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "dist", "extension");

await mkdir(out, { recursive: true });
await mkdir(join(out, "icons"), { recursive: true });
await mkdir(join(out, "vendor"), { recursive: true });

const entries = {
  background: join(root, "src/extension/background.ts"),
  content: join(root, "src/extension/content/index.ts"),
  popup: join(root, "src/extension/popup.ts"),
  dashboard: join(root, "src/extension/dashboard.ts"),
  "gaze-frame": join(root, "src/extension/gaze/frame.ts")
};

await esbuild.build({
  entryPoints: entries,
  bundle: true,
  outdir: out,
  format: "esm",
  platform: "browser",
  target: "chrome114",
  sourcemap: true,
  legalComments: "none"
});

await esbuild.build({
  entryPoints: [join(root, "src/proxy/index.ts")],
  bundle: true,
  outfile: join(root, "dist/proxy/index.js"),
  format: "esm",
  platform: "node",
  target: "node20",
  packages: "external",
  sourcemap: true
});

const copies = [
  ["src/extension/manifest.json", "manifest.json"],
  ["src/extension/popup.html", "popup.html"],
  ["src/extension/popup.css", "popup.css"],
  ["src/extension/dashboard.html", "dashboard.html"],
  ["src/extension/dashboard.css", "dashboard.css"],
  ["src/extension/gaze-frame.html", "gaze-frame.html"]
];
for (const [from, to] of copies) {
  await copyFile(join(root, from), join(out, to));
}

const webgazerCandidates = [
  join(root, "node_modules/webgazer/dist/webgazer.js"),
  join(root, "node_modules/webgazer/www/webgazer.js")
];
let vendored = false;
for (const candidate of webgazerCandidates) {
  try {
    await access(candidate);
    await copyFile(candidate, join(out, "vendor/webgazer.js"));
    vendored = true;
    break;
  } catch {
    // try next
  }
}
if (!vendored) {
  await writeFile(
    join(out, "vendor/webgazer.js"),
    "/* webgazer not installed; gaze provider reports unavailable */\n",
    "utf8"
  );
}

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAPUlEQVRYR+3XMQ4AIAgEQf7/0yoaGwkFZifV3GwH8C8gIiD3gYhA7gMRAbkPRATkPhARkPtAREDuAxGBcwF+VhMA4K8GsgAAAABJRU5ErkJggg==",
  "base64"
);
for (const size of [16, 32, 48, 128]) {
  await writeFile(join(out, "icons", `icon${size}.png`), png);
}

const manifest = JSON.parse(await readFile(join(out, "manifest.json"), "utf8"));
manifest._build = createHash("sha1").update(String(Date.now())).digest("hex").slice(0, 8);
await writeFile(join(out, "manifest.json"), JSON.stringify(manifest, null, 2));

console.log(`IntentLens extension built at ${out}`);
console.log(`WebGazer vendored: ${vendored}`);
