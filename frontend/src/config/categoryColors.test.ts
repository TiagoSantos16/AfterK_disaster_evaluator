import { beforeEach, describe, expect, it } from "vitest";

import { DEFAULT_CATEGORY_COLORS, loadCategoryColors, saveCategoryColors } from "./categoryColors";

const STORAGE_KEY = "geoai:categoryColors";

const createStorage = (): Storage => {
  let store: Record<string, string> = {};
  return {
    getItem: (key) => (key in store ? store[key] : null),
    setItem: (key, value) => {
      store[key] = String(value);
    },
    removeItem: (key) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    key: (index) => Object.keys(store)[index] ?? null,
    get length() {
      return Object.keys(store).length;
    },
  } as Storage;
};

describe("categoryColors", () => {
  beforeEach(() => {
    Object.defineProperty(window, "localStorage", { value: createStorage(), configurable: true });
  });

  it("returns defaults when nothing is stored", () => {
    expect(loadCategoryColors()).toEqual(DEFAULT_CATEGORY_COLORS);
  });

  it("round-trips saved colors", () => {
    saveCategoryColors({ ...DEFAULT_CATEGORY_COLORS, fallen_tree: "#123456" });
    expect(loadCategoryColors().fallen_tree).toBe("#123456");
    expect(loadCategoryColors().damaged_house).toBe(DEFAULT_CATEGORY_COLORS.damaged_house);
  });

  it("falls back to defaults on corrupt storage", () => {
    window.localStorage.setItem(STORAGE_KEY, "{not valid json");
    expect(loadCategoryColors()).toEqual(DEFAULT_CATEGORY_COLORS);
  });

  it("ignores invalid hex values but keeps valid ones", () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ fallen_tree: "red", damaged_house: "#000000" })
    );

    const loaded = loadCategoryColors();
    expect(loaded.fallen_tree).toBe(DEFAULT_CATEGORY_COLORS.fallen_tree);
    expect(loaded.damaged_house).toBe("#000000");
  });
});