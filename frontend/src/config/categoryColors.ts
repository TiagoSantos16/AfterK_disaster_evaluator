import { DamageClass } from "../types/dataset";

export type CategoryColors = Record<DamageClass, string>;

export const DEFAULT_CATEGORY_COLORS: CategoryColors = {
  fallen_tree: "#8B5A2B",
  damaged_house: "#DC2626",
  broken_light: "#F59E0B",
  wildfire_hazard: "#F97316",
  blocked_road: "#3B82F6",
};

const STORAGE_KEY = "geoai:categoryColors";

const isValidHex = (value: string): boolean => /^#[0-9a-fA-F]{6}$/.test(value);

export const loadCategoryColors = (): CategoryColors => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return DEFAULT_CATEGORY_COLORS;
    }

    const parsed = JSON.parse(raw) as Partial<CategoryColors>;
    const merged: CategoryColors = { ...DEFAULT_CATEGORY_COLORS };

    for (const damageClass of Object.keys(merged) as DamageClass[]) {
      const value = parsed[damageClass];
      if (typeof value === "string" && isValidHex(value)) {
        merged[damageClass] = value;
      }
    }

    return merged;
  } catch {
    return DEFAULT_CATEGORY_COLORS;
  }
};

export const saveCategoryColors = (colors: CategoryColors): void => {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(colors));
  } catch {
    // Storage unavailable (private mode / quota) — colors just won't persist.
  }
};