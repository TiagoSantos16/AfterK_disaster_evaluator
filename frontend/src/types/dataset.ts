export type DamageClass =
  | "fallen_tree"
  | "damaged_house"
  | "broken_light"
  | "wildfire_hazard"
  | "blocked_road";

export type LayerMode = "raw" | "segmentation" | "split";
export type BasemapMode = "map" | "satellite" | "osm";
export type TemporalState = "pre" | "post";

export type SatelliteProvider = "esri" | "sar" | "custom";
export type SegmentationSource = "osm-vector" | "none";

export interface DatasetVariant {
  id: string;
  label: string;
  date: string;
  rawRasterUrl?: string;
  segmentationVectorUrl?: string;
  bounds?: [number, number, number, number];
}

export interface DamagePoint {
  type: "Feature";
  geometry: {
    type: "Point";
    coordinates: [number, number];
  };
  properties: {
    id: string;
    class: DamageClass;
    severity: number;
    status: "active" | "resolved";
    description: string;
    timestamp: string;
  };
}

export interface DatasetConfig {
  id: string;
  name: string;
  city: string;
  coordinates: [number, number];
  zoom: number;
  description: string;
  rawRasterUrl?: string;
  segmentationVectorUrl?: string;
  satelliteProvider?: SatelliteProvider;
  customRasterUrl?: string;
  segmentationSource?: SegmentationSource;
  variants: DatasetVariant[];
  defaultVariantId: string;
  bounds?: [number, number, number, number];
  imageUrls?: {
    pre?: string;
    post?: string;
  };
  defaultPoints: DamagePoint[];
}

export interface MapNote {
  id: string;
  coordinates: [number, number];
  text: string;
  timestamp: string;
}

export interface IncidentNote {
  id: string;
  text: string;
  timestamp: string;
}