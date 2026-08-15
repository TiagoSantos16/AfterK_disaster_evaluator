import { describe, expect, it } from "vitest";

import { DamagePoint } from "../types/dataset";
import { filterVisiblePoints, hexToRgba, normalizeDamagePoint } from "./damage";

const makePoint = (id: string, damageClass: string): DamagePoint => ({
  type: "Feature",
  geometry: { type: "Point", coordinates: [0, 0] },
  properties: {
    id,
    class: damageClass as DamagePoint["properties"]["class"],
    severity: 0.5,
    status: "active",
    description: "",
    timestamp: "2026-01-01T00:00:00Z",
  },
});

describe("filterVisiblePoints", () => {
  const allFilters: Record<DamagePoint["properties"]["class"], boolean> = {
    fallen_tree: true,
    damaged_house: true,
    broken_light: true,
    wildfire_hazard: true,
    blocked_road: true,
  };

  it("drops removed ids", () => {
    const points = [makePoint("a", "fallen_tree"), makePoint("b", "broken_light")];
    expect(filterVisiblePoints(points, allFilters, new Set(["a"]))).toEqual([points[1]]);
  });

  it("drops classes disabled by filters", () => {
    const points = [makePoint("a", "fallen_tree"), makePoint("b", "broken_light")];
    const filters = { ...allFilters, broken_light: false };
    expect(filterVisiblePoints(points, filters, new Set())).toEqual([points[0]]);
  });

  it("keeps everything when nothing is removed or filtered", () => {
    const points = [makePoint("a", "fallen_tree"), makePoint("b", "broken_light")];
    expect(filterVisiblePoints(points, allFilters, new Set())).toEqual(points);
  });
});

describe("hexToRgba", () => {
  it("converts a 6-digit hex color with alpha", () => {
    expect(hexToRgba("#DC2626", 220)).toEqual([220, 38, 38, 220]);
  });

  it("expands a 3-digit hex color", () => {
    expect(hexToRgba("#F0F", 255)).toEqual([255, 0, 255, 255]);
  });

  it("handles a hex without the leading hash", () => {
    expect(hexToRgba("3B82F6", 115)).toEqual([59, 130, 246, 115]);
  });
});

describe("normalizeDamagePoint", () => {
  it("keeps a valid Feature point intact", () => {
    const result = normalizeDamagePoint({
      type: "Feature",
      geometry: { type: "Point", coordinates: [-8.9, 39.75] },
      properties: {
        id: "x1",
        class: "damaged_house",
        severity: 0.8,
        status: "active",
        description: "Roof damage",
        timestamp: "2026-01-01T00:00:00Z",
      },
    });

    expect(result).not.toBeNull();
    expect(result?.geometry.coordinates).toEqual([-8.9, 39.75]);
    expect(result?.properties.class).toBe("damaged_house");
    expect(result?.properties.severity).toBe(0.8);
    expect(result?.properties.id).toBe("x1");
  });

  it("returns null for non-objects", () => {
    expect(normalizeDamagePoint(null)).toBeNull();
    expect(normalizeDamagePoint(undefined)).toBeNull();
    expect(normalizeDamagePoint("feature")).toBeNull();
  });

  it("rejects non-Point geometries", () => {
    expect(
      normalizeDamagePoint({ type: "Feature", geometry: { type: "Polygon", coordinates: [] } })
    ).toBeNull();
  });

  it("rejects malformed coordinates", () => {
    expect(
      normalizeDamagePoint({ type: "Feature", geometry: { type: "Point", coordinates: [1] } })
    ).toBeNull();
  });

  it("clamps severity and falls back for unknown classes", () => {
    const result = normalizeDamagePoint({
      type: "Feature",
      geometry: { type: "Point", coordinates: [0, 0] },
      properties: { class: "mystery_class", severity: 7 },
    });

    expect(result?.properties.class).toBe("fallen_tree");
    expect(result?.properties.severity).toBe(1);
  });

  it("normalizes negative severity to zero", () => {
    const result = normalizeDamagePoint({
      type: "Feature",
      geometry: { type: "Point", coordinates: [0, 0] },
      properties: { class: "fallen_tree", severity: -2 },
    });

    expect(result?.properties.severity).toBe(0);
  });

  it("defaults status, description and supplies id/timestamp", () => {
    const result = normalizeDamagePoint({
      type: "Feature",
      geometry: { type: "Point", coordinates: [0, 0] },
      properties: { severity: 0.3 },
    });

    expect(result?.properties.status).toBe("active");
    expect(result?.properties.description).toBe("Imported incident");
    expect(result?.properties.id).toBeTruthy();
    expect(result?.properties.timestamp).toBeTruthy();
  });
});
