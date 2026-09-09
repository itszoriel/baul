import { describe, expect, it } from "vitest";
import { approximateCountryPoint } from "@/lib/globe";

describe("public globe country points", () => {
  it("uses a stable country-only offset", () => {
    const first = approximateCountryPoint("PHL", 12.8797, 121.774);
    const second = approximateCountryPoint("PHL", 12.8797, 121.774);
    expect(first).toEqual(second);
    expect(first).not.toEqual({ lat: 12.8797, lng: 121.774 });
  });

  it("keeps the approximate point close to the country centroid", () => {
    const point = approximateCountryPoint("PHL", 12.8797, 121.774);
    expect(Math.abs(point.lat - 12.8797)).toBeLessThan(0.5);
    expect(Math.abs(point.lng - 121.774)).toBeLessThan(0.5);
  });
});
