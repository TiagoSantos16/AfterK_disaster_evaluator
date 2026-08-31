import { DatasetConfig, DamagePoint } from "../types/dataset";

const buildPoint = (
  id: string,
  damageClass: DamagePoint["properties"]["class"],
  coordinates: [number, number],
  severity: number,
  status: "active" | "resolved",
  description: string,
  timestamp: string
): DamagePoint => ({
  type: "Feature",
  geometry: {
    type: "Point",
    coordinates,
  },
  properties: {
    id,
    class: damageClass,
    severity,
    status,
    description,
    timestamp,
  },
});

export const datasets: DatasetConfig[] = [
  {
    id: "marinha-grande-storm",
    name: "Default",
    city: "Leiria, Portugal",
    coordinates: [-8.9315, 39.7495],
    zoom: 13,
    description: "Windstorm aftermath with power and housing damage near industrial and residential blocks.",
    rawRasterUrl: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    satelliteProvider: "esri",
    segmentationSource: "osm-vector",
    bounds: [-9.051361, 39.717751, -8.76709, 39.783213],
    timeline: { start: "2026-01-18", eventDate: "2026-01-27", end: "2026-03-17" },
    variants: [
      {
        id: "pre-storm-2026-01-18",
        label: "Pre-storm",
        date: "2026-01-18",
        rawRasterUrl: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
        bounds: [-9.051361, 39.717751, -8.76709, 39.783213],
      },
      {
        id: "post-storm-2026-02-20",
        label: "Post-storm",
        date: "2026-02-20",
        rawRasterUrl: "https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
        bounds: [-9.051361, 39.717751, -8.76709, 39.783213],
      },
    ],
    defaultVariantId: "post-storm-2026-02-20",
    defaultPoints: [
      buildPoint(
        "mg-001",
        "fallen_tree",
        [-8.958, 39.754],
        0.76,
        "active",
        "Large eucalyptus down across bike lane and shoulder.",
        "2026-07-22T22:17:00Z"
      ),
      buildPoint(
        "mg-002",
        "fallen_tree",
        [-8.906, 39.741],
        0.58,
        "resolved",
        "Branch debris removed, remaining stump hazard marked.",
        "2026-07-22T20:12:00Z"
      ),
      buildPoint(
        "mg-003",
        "damaged_house",
        [-8.94, 39.77],
        0.88,
        "active",
        "Roof tile uplift with partial rain ingress.",
        "2026-07-22T23:02:00Z"
      ),
      buildPoint(
        "mg-004",
        "damaged_house",
        [-8.922, 39.729],
        0.43,
        "resolved",
        "Temporary tarp and electrical inspection complete.",
        "2026-07-22T19:21:00Z"
      ),
      buildPoint(
        "mg-005",
        "broken_light",
        [-8.978, 39.745],
        0.62,
        "active",
        "Street light pole tilted after transformer surge.",
        "2026-07-22T21:05:00Z"
      ),
      buildPoint(
        "mg-006",
        "broken_light",
        [-8.886, 39.762],
        0.39,
        "resolved",
        "Lamp head replaced, line restored.",
        "2026-07-22T18:50:00Z"
      ),
      buildPoint(
        "mg-007",
        "blocked_road",
        [-8.9315, 39.7495],
        0.7,
        "active",
        "Debris blocking the central square access road.",
        "2026-07-22T22:45:00Z"
      ),
    ],
  },
  // {
  //   id: "leiria-fuel-risk",
  //   name: "Leiria District Wildfire Fuel Risk",
  //   city: "Leiria District, Portugal",
  //   coordinates: [-8.8071, 39.7436],
  //   zoom: 12.6,
  //   description: "High-risk roadside vegetation and ignition corridors requiring preemptive clearing.",
  //   rawRasterUrl: "https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
  //   variants: [
  //     {
  //       id: "baseline-2026-01-18",
  //       label: "Baseline",
  //       date: "2026-01-18",
  //       rawRasterUrl: "https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
  //     },
  //     {
  //       id: "high-risk-2026-02-20",
  //       label: "High risk",
  //       date: "2026-02-20",
  //       rawRasterUrl: "https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
  //     },
  //   ],
  //   defaultVariantId: "high-risk-2026-02-20",
  //   defaultPoints: [
  //     buildPoint(
  //       "lr-001",
  //       "wildfire_hazard",
  //       [-8.8032, 39.7462],
  //       0.93,
  //       "active",
  //       "Dense dry fuel accumulation near roadway edge.",
  //       "2026-07-22T16:14:00Z"
  //     ),
  //     buildPoint(
  //       "lr-002",
  //       "wildfire_hazard",
  //       [-8.8118, 39.7397],
  //       0.85,
  //       "active",
  //       "Wind-exposed brush corridor within utility right-of-way.",
  //       "2026-07-22T17:02:00Z"
  //     ),
  //     buildPoint(
  //       "lr-003",
  //       "blocked_road",
  //       [-8.7986, 39.7444],
  //       0.67,
  //       "active",
  //       "Emergency access road partially blocked by debris piles.",
  //       "2026-07-22T15:08:00Z"
  //     ),
  //     buildPoint(
  //       "lr-004",
  //       "fallen_tree",
  //       [-8.8151, 39.7473],
  //       0.53,
  //       "resolved",
  //       "Tree cleared from turnout lane adjacent to pine stand.",
  //       "2026-07-22T14:35:00Z"
  //     ),
  //   ],
  // },
];

export const getDefaultDataset = (): DatasetConfig => datasets[0];