import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function pngDimensions(path: string): { width: number; height: number } {
  const bytes = readFileSync(path);
  expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}

describe("Baul brand assets", () => {
  it.each([
    ["public/favicon.png", 96, 96],
    ["public/apple-touch-icon.png", 180, 180],
    ["public/baul-logo.png", 512, 512],
    ["public/baul-social.png", 1200, 630],
  ])("keeps %s at its intended dimensions", (path, width, height) => {
    expect(pngDimensions(path)).toEqual({ width, height });
  });
});
