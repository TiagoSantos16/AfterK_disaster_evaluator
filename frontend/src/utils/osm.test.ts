import { describe, expect, it } from "vitest";

import { getOSMClass, isSemanticLayer, semanticColors } from "./osm";

const layer = (sourceLayer: string) => ({ id: "l", ["source-layer"]: sourceLayer });

describe("getOSMClass", () => {
  it("classifies known source layers", () => {
    expect(getOSMClass(layer("building"))).toBe("building");
    expect(getOSMClass(layer("water"))).toBe("water");
    expect(getOSMClass(layer("waterway"))).toBe("water");
    expect(getOSMClass(layer("landcover"))).toBe("landcover");
    expect(getOSMClass(layer("park"))).toBe("landcover");
    expect(getOSMClass(layer("transportation"))).toBe("road");
    expect(getOSMClass(layer("transportation_name"))).toBe("road");
    expect(getOSMClass(layer("poi"))).toBe("facility");
    expect(getOSMClass(layer("landuse"))).toBe("urban");
    expect(getOSMClass(layer("aeroway"))).toBe("airport");
  });

  it("returns null for unknown source layers", () => {
    expect(getOSMClass(layer("boundary"))).toBeNull();
    expect(getOSMClass(layer("place"))).toBeNull();
    expect(getOSMClass({ id: "l" })).toBeNull();
  });

  it("is case-insensitive", () => {
    expect(getOSMClass(layer("Building"))).toBe("building");
  });

  it("exposes a semantic color for every class", () => {
    expect(semanticColors.building).toBe("#fbbf24");
    expect(semanticColors.water).toBe("#3b82f6");
    expect(semanticColors.landcover).toBe("#22c55e");
    expect(semanticColors.road).toBe("#9ca3af");
    expect(semanticColors.facility).toBe("#e11d48");
    expect(semanticColors.urban).toBe("#b45309");
    expect(semanticColors.airport).toBe("#374151");
  });
});

describe("isSemanticLayer", () => {
  it("returns true only for classified layers", () => {
    expect(isSemanticLayer(layer("water"))).toBe(true);
    expect(isSemanticLayer(layer("road"))).toBe(false);
  });
});
