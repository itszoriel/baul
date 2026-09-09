import { describe, expect, it } from "vitest";
import { isMp3, totalObjectBytes } from "@/lib/media";

describe("media validation", () => {
  it("recognizes ID3 and MPEG frame headers", () => {
    expect(isMp3(new Uint8Array([0x49, 0x44, 0x33]))).toBe(true);
    expect(isMp3(new Uint8Array([0xff, 0xfb, 0x90]))).toBe(true);
    expect(isMp3(new Uint8Array([0x52, 0x49, 0x46, 0x46]))).toBe(false);
  });

  it("reads the full object size from a ranged response", () => {
    expect(totalObjectBytes(new Headers({ "content-range": "bytes 0-11/15728640", "content-length": "12" }))).toBe(15_728_640);
    expect(totalObjectBytes(new Headers({ "content-length": "1024" }))).toBe(1024);
    expect(totalObjectBytes(new Headers())).toBeNull();
  });
});
