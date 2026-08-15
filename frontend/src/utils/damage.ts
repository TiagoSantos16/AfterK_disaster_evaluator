import { DamageClass, DamagePoint, DatasetConfig } from "../types/dataset";

export const hexToRgba = (hex: string, alpha: number): [number, number, number, number] => {
  const normalized = hex.replace("#", "");
  const full = normalized.length === 3 ? normalized.split("").map((char) => char + char).join("") : normalized;
  const value = parseInt(full, 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255, alpha];
};

export const filterVisiblePoints = (
  points: DamagePoint[],
  activeFilters: Record<DamageClass, boolean>,
  removedIds: ReadonlySet<string>
): DamagePoint[] =>
  points.filter(
    (point) => !removedIds.has(point.properties.id) && activeFilters[point.properties.class]
  );

export const randomId = (): string => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

export const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (char) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[char];
  });

const isBlobUrl = (url: string | undefined): url is string => typeof url === "string" && url.startsWith("blob:");

export const collectRasterBlobUrls = (dataset: DatasetConfig): string[] => {
  const urls = [
    dataset.rawRasterUrl,
    dataset.customRasterUrl,
    ...dataset.variants.map((variant) => variant.rawRasterUrl),
  ];
  return urls.filter(isBlobUrl);
};

const ALLOWED_CLASSES: DamageClass[] = [
  "fallen_tree",
  "damaged_house",
  "broken_light",
  "wildfire_hazard",
  "blocked_road",
];

export const normalizeDamagePoint = (item: unknown): DamagePoint | null => {
  if (!item || typeof item !== "object") {
    return null;
  }

  const candidate = item as {
    type?: string;
    geometry?: { type?: string; coordinates?: [number, number] };
    properties?: {
      id?: unknown;
      class?: unknown;
      severity?: unknown;
      status?: unknown;
      description?: unknown;
      timestamp?: unknown;
    };
  };

  if (candidate.type !== "Feature" || candidate.geometry?.type !== "Point") {
    return null;
  }

  const coordinates = candidate.geometry.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length !== 2) {
    return null;
  }

  const rawClass = String(candidate.properties?.class ?? "fallen_tree");
  const damageClass = ALLOWED_CLASSES.includes(rawClass as DamageClass)
    ? (rawClass as DamageClass)
    : "fallen_tree";

  const rawSeverity = Number(candidate.properties?.severity ?? 0.5);
  const severity = Number.isFinite(rawSeverity) ? Math.min(1, Math.max(0, rawSeverity)) : 0.5;

  return {
    type: "Feature",
    geometry: {
      type: "Point",
      coordinates,
    },
    properties: {
      id: String(candidate.properties?.id ?? randomId()),
      class: damageClass,
      severity,
      status: candidate.properties?.status === "resolved" ? "resolved" : "active",
      description: String(candidate.properties?.description ?? "Imported incident"),
      timestamp: String(candidate.properties?.timestamp ?? new Date().toISOString()),
    },
  };
};
