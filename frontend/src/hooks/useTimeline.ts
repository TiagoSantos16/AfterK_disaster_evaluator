import { useEffect, useState } from "react";

import { TimelineScene, TimelineWindow } from "../types/dataset";
import { fixedDatesToScenes } from "../utils/timeline";

export type TimelineStatus = "loading" | "live" | "fallback";

export type TimelineState = {
  status: TimelineStatus;
  window: TimelineWindow | null;
  scenes: TimelineScene[];
};

export function useTimeline(
  datasetId: string,
  apiBaseUrl: string | undefined,
  enabled: boolean = true,
  bbox: [number, number, number, number] | null = null,
  source: string | null = null
): TimelineState {
  const [state, setState] = useState<TimelineState>({
    status: "fallback",
    window: null,
    scenes: fixedDatesToScenes(),
  });

  useEffect(() => {
    if (!enabled) {
      setState({ status: "fallback", window: null, scenes: [] });
      return;
    }

    const controller = new AbortController();
    setState({ status: "loading", window: null, scenes: [] });

    if (!apiBaseUrl) {
      setState({ status: "fallback", window: null, scenes: fixedDatesToScenes() });
      return;
    }

    const params = new URLSearchParams();
    if (bbox) {
      params.append("bbox", bbox.join(","));
    }
    if (source) {
      params.append("source", source);
    }
    const query = params.toString() ? `?${params.toString()}` : "";

    const fetchTimeline = async () => {
      try {
        const response = await fetch(`${apiBaseUrl}/api/v1/datasets/${datasetId}/timeline${query}`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`API returned status ${response.status}`);
        }
        const payload = (await response.json()) as { window: TimelineWindow | null; scenes: TimelineScene[] };
        if (payload.scenes.length > 0) {
          setState({ status: "live", window: payload.window, scenes: payload.scenes });
        } else {
          setState({ status: "fallback", window: null, scenes: fixedDatesToScenes() });
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        setState({ status: "fallback", window: null, scenes: fixedDatesToScenes() });
      }
    };

    void fetchTimeline();

    return () => {
      controller.abort();
    };
  }, [datasetId, apiBaseUrl, enabled, bbox?.join(","), source]);

  return state;
}
