import { DamagePoint } from "../types/dataset";

export type CitySatelliteSource = "sentinel-2-rgb" | "sentinel-2-swir" | "sentinel-2-cir" | "sentinel-2-ndvi" | "esri";

export const isSentinelSource = (s: CitySatelliteSource): boolean => s.startsWith("sentinel-2");

export const DEMO_AVAILABLE_SOURCES: ReadonlySet<CitySatelliteSource> = new Set([
  "sentinel-2-rgb",
  "sentinel-2-ndvi",
  "esri",
]);

export const isDemoSourceAvailable = (s: CitySatelliteSource): boolean => DEMO_AVAILABLE_SOURCES.has(s);

export type CityConfig = {
  id: string;
  name: string;
  center: [number, number];
  zoom: number;
  bbox: [number, number, number, number];
  satelliteSource: CitySatelliteSource;
  accent: string;
  defaultPoints: DamagePoint[];
};

export const SOURCE_LABELS: Record<CitySatelliteSource, string> = {
  "sentinel-2-rgb": "Copernicus Sentinel-2 RGB",
  "sentinel-2-swir": "Copernicus Sentinel-2 SWIR",
  "sentinel-2-cir": "Copernicus Sentinel-2 CIR",
  "sentinel-2-ndvi": "Copernicus Sentinel-2 NDVI",
  "esri": "Esri World Imagery",
};

const point = (
  id: string,
  className: DamagePoint["properties"]["class"],
  coordinates: [number, number],
  severity: number,
  status: "active" | "resolved",
  description: string
): DamagePoint => ({
  type: "Feature",
  geometry: { type: "Point", coordinates },
  properties: {
    id,
    class: className,
    severity,
    status,
    description,
    timestamp: "2026-01-27T18:00:00Z",
  },
});

export const cities: CityConfig[] = [
  {
    id: "marinha-grande",
    name: "Marinha Grande",
    center: [-8.9315, 39.7495],
    zoom: 12.6,
    bbox: [-9.05, 39.71, -8.88165, 39.79],
    satelliteSource: "sentinel-2-rgb",
    accent: "#F59E0B",
    defaultPoints: [
      point("mg-001", "fallen_tree", [-8.9345, 39.7506], 0.76, "active", "Large eucalyptus down across bike lane and shoulder."),
      point("mg-002", "fallen_tree", [-8.9289, 39.7469], 0.58, "resolved", "Branch debris removed, remaining stump hazard marked."),
      point("mg-003", "damaged_house", [-8.9327, 39.7522], 0.88, "active", "Roof tile uplift with partial rain ingress."),
      point("mg-004", "damaged_house", [-8.9268, 39.7483], 0.43, "resolved", "Temporary tarp and electrical inspection complete."),
      point("mg-005", "broken_light", [-8.9297, 39.7449], 0.62, "active", "Street light pole tilted after transformer surge."),
      point("mg-006", "broken_light", [-8.9374, 39.7478], 0.39, "resolved", "Lamp head replaced, line restored."),
    ],
  },
  {
    id: "leiria",
    name: "Leiria",
    center: [-8.8071, 39.7436],
    zoom: 12.2,
    bbox: [-8.91138, 39.668, -8.689, 39.812],
    satelliteSource: "sentinel-2-rgb",
    accent: "#06B6D4",
    defaultPoints: [
      point("lr-101", "fallen_tree", [-8.83, 39.745], 0.71, "active", "Pine snapped across Rua do Bairro, lane blocked."),
      point("lr-102", "fallen_tree", [-8.78, 39.76], 0.55, "resolved", "Trunk cleared by municipal crew."),
      point("lr-103", "damaged_house", [-8.81, 39.73], 0.82, "active", "Chimney collapse through garage roof."),
      point("lr-104", "damaged_house", [-8.77, 39.72], 0.47, "resolved", "Shutter and gutter repairs finished."),
      point("lr-105", "broken_light", [-8.84, 39.72], 0.6, "active", "Lantern hanging from cable after gusts."),
      point("lr-106", "blocked_road", [-8.79, 39.7], 0.65, "active", "Downed limb blocking service road entrance."),
    ],
  },
  {
    id: "ourem",
    name: "Ourém",
    center: [-8.57489, 39.657015],
    zoom: 12.2,
    bbox: [-8.60296, 39.63896, -8.54682, 39.67507],
    satelliteSource: "sentinel-2-rgb",
    accent: "#D946EF",
    defaultPoints: [
      point("ou-201", "fallen_tree", [-8.58, 39.66], 0.68, "active", "Eucalyptus across footpath near castle slope."),
      point("ou-202", "fallen_tree", [-8.56, 39.65], 0.52, "resolved", "Sectioned and hauled away."),
      point("ou-203", "damaged_house", [-8.59, 39.65], 0.77, "active", "Roof sheeting peeled back over living room."),
      point("ou-204", "damaged_house", [-8.57, 39.67], 0.44, "resolved", "Patched with tarp; mason scheduled."),
      point("ou-205", "broken_light", [-8.555, 39.655], 0.58, "active", "Column leaning over sidewalk by school."),
      point("ou-206", "blocked_road", [-8.585, 39.645], 0.61, "active", "Fallen branches narrowing rural road to one lane."),
    ],
  },
];

export const findCity = (id: string): CityConfig | undefined => cities.find((city) => city.id === id);