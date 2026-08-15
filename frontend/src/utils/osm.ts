import type * as maplibregl from "maplibre-gl";

export type StyleLayerLike = {
  id: string;
  type?: string;
  paint?: Record<string, unknown>;
  layout?: {
    visibility?: maplibregl.VisibilitySpecification;
  };
  ["source-layer"]?: string;
};

export const semanticColors = {
  building: "#fbbf24",
  water: "#3b82f6",
  landcover: "#22c55e",
  road: "#9ca3af",
  facility: "#e11d48",
  urban: "#b45309",
  airport: "#374151",
};

export const getOSMClass = (layer: StyleLayerLike): keyof typeof semanticColors | null => {
  const source = (layer["source-layer"] ?? "").toLowerCase();
  if (source === "building") {
    return "building";
  }
  if (source === "water" || source === "waterway" || source === "water_name") {
    return "water";
  }
  if (source === "landcover" || source === "park") {
    return "landcover";
  }
  if (source === "transportation" || source === "transportation_name") {
    return "road";
  }
  if (source === "poi") {
    return "facility";
  }
  if (source === "landuse") {
    return "urban";
  }
  if (source === "aeroway") {
    return "airport";
  }
  return null;
};

export const isSemanticLayer = (layer: StyleLayerLike) => {
  return getOSMClass(layer) !== null;
};

export const getSemanticColor = (layer: StyleLayerLike) => {
  const cls = getOSMClass(layer);
  return cls ? semanticColors[cls] : semanticColors.landcover;
};
