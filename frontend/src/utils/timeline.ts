import { TimelineScene, TimelineStop } from "../types/dataset";

const dayMs = 24 * 60 * 60 * 1000;

export const FIXED_CAPTURE_DATES: readonly string[] = [
  "2026-01-18",
  "2026-01-26",
  "2026-01-28",
  "2026-02-20",
  "2026-03-17",
];

export const parseDateIso = (isoDate: string): number => Date.parse(`${isoDate.slice(0, 10)}T00:00:00Z`);

const parseDate = (value: string): Date => {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
};

export const dateDistanceInDays = (left: string, right: string): number => {
  return Math.round(Math.abs(parseDate(left).getTime() - parseDate(right).getTime()) / dayMs);
};

export const fixedDatesToScenes = (): TimelineScene[] =>
  FIXED_CAPTURE_DATES.map((date) => ({
    date,
    captureDate: `${date}T00:00:00Z`,
    cloudCover: null,
    tileUrlTemplate: "",
    itemId: `s2-${date}`,
  }));

export const stopsFromScenes = (scenes: TimelineScene[]): TimelineStop[] =>
  [...scenes]
    .sort((left, right) => parseDateIso(left.date) - parseDateIso(right.date))
    .map((scene) => ({ key: scene.date, date: scene.date, label: "" }));

export const nearestScene = (scenes: TimelineScene[], target: string): TimelineScene | null => {
  if (scenes.length === 0) {
    return null;
  }
  let best: TimelineScene = scenes[0];
  let bestDistance = dateDistanceInDays(best.date, target);
  for (const scene of scenes.slice(1)) {
    const distance = dateDistanceInDays(scene.date, target);
    if (distance < bestDistance) {
      best = scene;
      bestDistance = distance;
    }
  }
  return best;
};

export type SceneWindow = {
  startMs: number;
  endMs: number;
};

export const dayRangeForScenes = (scenes: TimelineScene[]): SceneWindow => {
  if (scenes.length === 0) {
    return { startMs: 0, endMs: 0 };
  }
  let startMs = Number.POSITIVE_INFINITY;
  let endMs = Number.NEGATIVE_INFINITY;
  for (const scene of scenes) {
    const time = parseDate(scene.date).getTime();
    if (time < startMs) {
      startMs = time;
    }
    if (time > endMs) {
      endMs = time;
    }
  }
  return { startMs, endMs };
};

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

const dateKeyFromMs = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

export const fractionForDate = (date: string, window: SceneWindow): number => {
  if (window.endMs <= window.startMs) {
    return 0;
  }
  return clamp01((parseDate(date).getTime() - window.startMs) / (window.endMs - window.startMs));
};

export const nearestSceneForFraction = (
  fraction: number,
  window: SceneWindow,
  scenes: TimelineScene[]
): TimelineScene | null => {
  if (scenes.length === 0 || window.endMs <= window.startMs) {
    return null;
  }
  const target = dateKeyFromMs(window.startMs + clamp01(fraction) * (window.endMs - window.startMs));
  return nearestScene(scenes, target);
};
