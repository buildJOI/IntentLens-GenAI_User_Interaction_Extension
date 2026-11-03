import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as esbuild from "esbuild";

describe("injected content bundle", () => {
  it("builds as a classic script without ESM import or export statements", async () => {
    const result = await esbuild.build({
      entryPoints: [join(process.cwd(), "src/extension/content/index.ts")],
      bundle: true,
      write: false,
      format: "iife",
      platform: "browser",
      target: "chrome114"
    });
    const code = result.outputFiles[0].text;

    expect(code).not.toMatch(/^\s*(?:import|export)\s/m);
    expect(code).toContain("content-script-ready-ack");
  }, 15_000);

  it("keeps the production build configured as an IIFE", async () => {
    const buildScript = await readFile(join(process.cwd(), "scripts/build.mjs"), "utf8");
    expect(buildScript).toMatch(/src\/extension\/content\/index\.ts[\s\S]*?format:\s*["']iife["']/);
    expect(buildScript).toContain("node_modules/webgazer/dist/mediapipe");
  });
});
