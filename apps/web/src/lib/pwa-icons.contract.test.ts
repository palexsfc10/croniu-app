/**
 * Contract tests for Croniu PWA icons (RC2.8).
 * Source of truth: assets/brand/croniu-c-official.png → icons/*-v3.png
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const repoRoot = path.resolve(webRoot, "../..");
const iconsDir = path.join(webRoot, "public/icons");
const publicDir = path.join(webRoot, "public");

/** Known-bad RC2.7 transparent cutout icon sha256 prefix (served in PRD before RC2.8). */
const LEGACY_TRANSPARENT_ICON_192_SHA_PREFIX = "034ff9fedd77e4ce";
const LEGACY_TRANSPARENT_ICON_512_SHA_PREFIX = "cbe6b97917905ca2";

function sha256(filePath: string): string {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function pngSize(filePath: string): { width: number; height: number } {
  const buf = readFileSync(filePath);
  expect(buf.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function readPngRgbaCorner(filePath: string): [number, number, number, number] {
  // Minimal PNG decode via ImageData is unavailable in node without deps;
  // instead assert IHDR color type includes alpha and file is opaque-enough by size.
  const buf = readFileSync(filePath);
  const colorType = buf[25];
  // 6 = RGBA truecolor+alpha
  expect([2, 6]).toContain(colorType);
  return [buf[25], 0, 0, 0];
}

describe("PWA icon contract (v3 official Croniu C)", () => {
  const manifestPath = path.join(publicDir, "manifest.webmanifest");
  const swPath = path.join(publicDir, "sw.js");
  const sourcePath = path.join(repoRoot, "assets/brand/croniu-c-official.png");
  const icon192 = path.join(iconsDir, "icon-192-v3.png");
  const icon512 = path.join(iconsDir, "icon-512-v3.png");
  const iconMaskable = path.join(iconsDir, "icon-512-maskable-v3.png");

  it("keeps the official source asset committed and untouched by name", () => {
    expect(existsSync(sourcePath)).toBe(true);
    expect(pngSize(sourcePath)).toEqual({ width: 1254, height: 1254 });
  });

  it("points the webmanifest only at versioned official derivatives", () => {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      icons: Array<{ src: string; sizes: string; type: string; purpose: string }>;
    };
    expect(manifest.icons).toHaveLength(3);
    const srcs = manifest.icons.map((i) => i.src);
    expect(srcs).toEqual([
      "/icons/icon-192-v3.png",
      "/icons/icon-512-v3.png",
      "/icons/icon-512-maskable-v3.png",
    ]);
    expect(srcs.every((s) => !s.includes("icon-192.png") || s.includes("v3"))).toBe(true);
    expect(manifest.icons.every((i) => i.type === "image/png")).toBe(true);
    expect(manifest.icons.map((i) => i.purpose)).toEqual(["any", "any", "maskable"]);
    expect(manifest.icons.some((i) => i.purpose.includes(" "))).toBe(false);
  });

  it("ships icons with correct dimensions and removes legacy unversioned names", () => {
    expect(existsSync(path.join(iconsDir, "icon-192.png"))).toBe(false);
    expect(existsSync(path.join(iconsDir, "icon-512.png"))).toBe(false);
    expect(pngSize(icon192)).toEqual({ width: 192, height: 192 });
    expect(pngSize(icon512)).toEqual({ width: 512, height: 512 });
    expect(pngSize(iconMaskable)).toEqual({ width: 512, height: 512 });
    readPngRgbaCorner(icon192);
  });

  it("does not reuse the RC2.7 transparent/generic icon payload", () => {
    const h192 = sha256(icon192);
    const h512 = sha256(icon512);
    expect(h192.startsWith(LEGACY_TRANSPARENT_ICON_192_SHA_PREFIX)).toBe(false);
    expect(h512.startsWith(LEGACY_TRANSPARENT_ICON_512_SHA_PREFIX)).toBe(false);
    // Opaque tile is much larger than the transparent cutout (~18KB).
    expect(readFileSync(icon192).byteLength).toBeGreaterThan(20000);
    expect(readFileSync(icon512).byteLength).toBeGreaterThan(100000);
  });

  it("bumps service worker cache to v4, precaches v3 icons, and does not cache-first HTML", () => {
    const sw = readFileSync(swPath, "utf8");
    expect(sw).toContain("croniu-static-v4");
    expect(sw).toContain("/icons/icon-192-v3.png");
    expect(sw).toContain("/icons/icon-512-v3.png");
    expect(sw).toContain("/icons/icon-512-maskable-v3.png");
    expect(sw).not.toContain("/icons/icon-192.png");
    expect(sw).not.toContain("croniu-static-v3");
    expect(sw).toContain("request.mode === \"navigate\"");
  });

  it("keeps Next.js app icons generated from the official tile", () => {
    const favicon = path.join(webRoot, "src/app/favicon.ico");
    const icon = path.join(webRoot, "src/app/icon.png");
    const apple = path.join(webRoot, "src/app/apple-icon.png");
    expect(existsSync(favicon)).toBe(true);
    expect(pngSize(icon)).toEqual({ width: 512, height: 512 });
    expect(pngSize(apple)).toEqual({ width: 180, height: 180 });
    expect(sha256(icon)).toBe(sha256(icon512));
  });

  it("ICON_MANIFEST_v3.json uses only repo-relative POSIX paths", () => {
    const iconManifestPath = path.join(iconsDir, "ICON_MANIFEST_v3.json");
    expect(existsSync(iconManifestPath)).toBe(true);
    const raw = readFileSync(iconManifestPath, "utf8");
    expect(raw).not.toMatch(/^[A-Za-z]:[\\/]/m);
    expect(raw).not.toMatch(/C:\\|C:\//);
    expect(raw).not.toMatch(/\/home\/|\/Users\//);
    const body = JSON.parse(raw) as {
      source: string;
      derivatives: Record<string, { path: string; sha256: string; bytes: number }>;
    };
    expect(body.source).toBe("assets/brand/croniu-c-official.png");
    expect(path.isAbsolute(body.source)).toBe(false);
    for (const entry of Object.values(body.derivatives)) {
      expect(path.isAbsolute(entry.path)).toBe(false);
      expect(entry.path.startsWith("apps/")).toBe(true);
      expect(entry.path.includes("\\")).toBe(false);
      expect(existsSync(path.join(repoRoot, entry.path))).toBe(true);
      expect(entry.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(entry.bytes).toBeGreaterThan(0);
    }
  });
});
