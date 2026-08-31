import { useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";

import { TimelineScene, TimelineStop } from "../types/dataset";
import { CitySatelliteSource } from "../config/cities";
import { dayRangeForScenes, fractionForDate, nearestSceneForFraction, parseDateIso } from "../utils/timeline";

type TimelineBarProps = {
  scenes: TimelineScene[];
  stops: TimelineStop[] | null;
  activeSceneDate: string | null;
  eventDate?: string;
  source?: CitySatelliteSource;
  sidebarCollapsed: boolean;
  onSceneChange: (date: string) => void;
};

const PLAY_INTERVAL_MS = 1100;

function TimelineBar({ scenes, stops, activeSceneDate, eventDate, source, sidebarCollapsed, onSceneChange }: TimelineBarProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const activeSceneDateRef = useRef<string | null>(activeSceneDate);
  const [dragFraction, setDragFraction] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);

  const orderedStops: TimelineStop[] = stops && stops.length >= 2 ? stops : [];
  const fallbackWindow = useMemo(() => dayRangeForScenes(scenes), [scenes]);
  const activeScene = useMemo(
    () => scenes.find((scene) => scene.date === activeSceneDate) ?? null,
    [scenes, activeSceneDate]
  );

  const isDimmed = source === "esri";

  activeSceneDateRef.current = activeSceneDate;

  const fractionForStopIndex = (index: number): number => {
    if (orderedStops.length < 2) {
      return 0;
    }
    return index / (orderedStops.length - 1);
  };

  const stopIndexForFraction = (fraction: number): number => {
    if (orderedStops.length < 2) {
      return 0;
    }
    const index = Math.round(fraction * (orderedStops.length - 1));
    return Math.min(orderedStops.length - 1, Math.max(0, index));
  };

  const activeStopIndex =
    orderedStops.length > 0
      ? orderedStops.findIndex((stop) => stop.date === activeSceneDate)
      : -1;
  const knobFraction =
    orderedStops.length > 0
      ? dragFraction !== null
        ? dragFraction
        : activeStopIndex >= 0
          ? fractionForStopIndex(activeStopIndex)
          : 0
      : dragFraction ?? (activeSceneDate ? fractionForDate(activeSceneDate, fallbackWindow) : 0);

  const moveToStop = (index: number) => {
    const clamped = Math.min(orderedStops.length - 1, Math.max(0, index));
    onSceneChange(orderedStops[clamped].date);
  };

  const stepToIndex = (nextIndex: number) => {
    if (orderedStops.length > 0) {
      moveToStop(nextIndex);
      return;
    }
    if (nextIndex < 0 || nextIndex >= scenes.length) {
      return;
    }
    onSceneChange(scenes[nextIndex].date);
  };

  useEffect(() => {
    if (!playing) {
      return;
    }
    const step = () => {
      const currentIndex = orderedStops.length
        ? orderedStops.findIndex((stop) => stop.date === activeSceneDateRef.current)
        : scenes.findIndex((scene) => scene.date === activeSceneDateRef.current);
      const lastIndex = orderedStops.length ? orderedStops.length - 1 : scenes.length - 1;
      const nextIndex = currentIndex + 1;
      if (currentIndex === -1 || nextIndex >= lastIndex + 1) {
        setPlaying(false);
        return;
      }
      if (orderedStops.length > 0) {
        moveToStop(nextIndex);
      } else {
        onSceneChange(scenes[nextIndex].date);
      }
    };

    if (orderedStops.length + scenes.length < 2) {
      setPlaying(false);
      return;
    }
    const timer = window.setInterval(step, PLAY_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [playing, orderedStops, scenes, onSceneChange]);

  if (scenes.length === 0 && orderedStops.length === 0) {
    return null;
  }

  const fractionFromClientX = (clientX: number): number => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) {
      return 0;
    }
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  };

  const snapToStopFromFraction = (fraction: number) => {
    if (orderedStops.length > 0) {
      const index = stopIndexForFraction(fraction);
      const stop = orderedStops[index];
      if (stop && stop.date !== activeSceneDateRef.current) {
        onSceneChange(stop.date);
      }
      return;
    }
    const scene = nearestSceneForFraction(fraction, fallbackWindow, scenes);
    if (scene && scene.date !== activeSceneDateRef.current) {
      onSceneChange(scene.date);
    }
  };

  const handleTrackPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setPlaying(false);
    const fraction = fractionFromClientX(event.clientX);
    setDragFraction(fraction);
    snapToStopFromFraction(fraction);
  };

  const handleTrackPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragFraction === null) {
      return;
    }
    const fraction = fractionFromClientX(event.clientX);
    setDragFraction(fraction);
    if (orderedStops.length === 0) {
      const scene = nearestSceneForFraction(fraction, fallbackWindow, scenes);
      if (scene && scene.date !== activeSceneDateRef.current) {
        onSceneChange(scene.date);
      }
    }
  };

  const handleTrackPointerUp = () => {
    if (orderedStops.length > 0 && dragFraction !== null) {
      const index = stopIndexForFraction(dragFraction);
      moveToStop(index);
    }
    setDragFraction(null);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const currentIndex = orderedStops.length
      ? orderedStops.findIndex((stop) => stop.date === activeSceneDateRef.current)
      : scenes.findIndex((scene) => scene.date === activeSceneDateRef.current);
    if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      event.preventDefault();
      setPlaying(false);
      stepToIndex(currentIndex === -1 ? 0 : currentIndex + 1);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      event.preventDefault();
      setPlaying(false);
      stepToIndex(currentIndex === -1 ? (orderedStops.length ? orderedStops.length - 1 : scenes.length - 1) : currentIndex - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      setPlaying(false);
      stepToIndex(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setPlaying(false);
      stepToIndex(orderedStops.length ? orderedStops.length - 1 : scenes.length - 1);
    }
  };

  const handleTogglePlay = () => {
    if (playing) {
      setPlaying(false);
      return;
    }
    const lastIndex = orderedStops.length ? orderedStops.length - 1 : scenes.length - 1;
    const isLast =
      activeSceneDateRef.current ===
      (orderedStops.length ? orderedStops[lastIndex].date : scenes[lastIndex].date);
    if (isLast) {
      const firstDate = orderedStops.length ? orderedStops[0].date : scenes[0].date;
      onSceneChange(firstDate);
    }
    setPlaying(true);
  };

  const ticks = orderedStops.length > 0 ? orderedStops : scenes;
  const eventTime = eventDate ? Date.parse(`${eventDate}T00:00:00Z`) : Number.NaN;
  const windowForEvent = orderedStops.length
    ? { startMs: parseDateIso(orderedStops[0].date), endMs: parseDateIso(orderedStops[orderedStops.length - 1].date) }
    : fallbackWindow;
  const showEventMarker =
    !Number.isNaN(eventTime) &&
    windowForEvent.endMs > windowForEvent.startMs &&
    eventTime >= windowForEvent.startMs &&
    eventTime <= windowForEvent.endMs;
  const eventFraction = showEventMarker
    ? (function () {
        const list = orderedStops.length > 0
          ? orderedStops.map((s, i) => ({ date: s.date, frac: fractionForStopIndex(i) }))
          : scenes.map((s) => ({ date: s.date, frac: fractionForDate(s.date, fallbackWindow) }));
        let beforeIdx = -1;
        let afterIdx = -1;
        for (let i = 0; i < list.length; i++) {
          if (list[i].date <= eventDate!) beforeIdx = i;
          if (afterIdx === -1 && list[i].date >= eventDate!) afterIdx = i;
        }
        if (beforeIdx >= 0 && afterIdx >= 0 && beforeIdx !== afterIdx) {
          return (list[beforeIdx].frac + list[afterIdx].frac) / 2;
        }
        if (beforeIdx >= 0) return list[beforeIdx].frac;
        if (afterIdx >= 0) return list[afterIdx].frac;
        const span = windowForEvent.endMs - windowForEvent.startMs;
        return span > 0 ? (eventTime - windowForEvent.startMs) / span : 0;
      })()
    : null;

  return (
    <div className={`timeline-bar ${isDimmed ? "is-dimmed" : ""} ${sidebarCollapsed ? "sidebar-closed" : ""}`} role="group" aria-label="Imagery timeline">
      {ticks.length > 1 && (
        <button
          type="button"
          className="timeline-play"
          onClick={handleTogglePlay}
          aria-label={playing ? "Pause timeline playback" : "Play through captures"}
        >
          {playing ? <Pause size={14} /> : <Play size={14} />}
        </button>
      )}
      <div
        ref={trackRef}
        className={`timeline-track ${dragFraction !== null ? "is-dragging" : ""}`}
        onPointerDown={handleTrackPointerDown}
        onPointerMove={handleTrackPointerMove}
        onPointerUp={handleTrackPointerUp}
        onLostPointerCapture={handleTrackPointerUp}
      >
        <div className="timeline-rail" />
        <div
          className="timeline-progress"
          style={{ width: `${Math.max(0, Math.min(1, knobFraction)) * 100}%` }}
        />
        {showEventMarker && eventFraction !== null && (
          <span
            className="timeline-event-marker"
            style={{ left: `${eventFraction * 100}%` }}
            title={`Storm: ${eventDate}`}
          >
            <span className="timeline-event-label">storm</span>
          </span>
        )}
        {orderedStops.length > 0
          ? orderedStops.map((stop, index) => (
              <button
                key={stop.key}
                type="button"
                className={`timeline-tick ${stop.date === activeSceneDate ? "is-active" : ""}`}
                style={{ left: `${fractionForStopIndex(index) * 100}%` }}
                aria-label={`Go to ${stop.date}`}
                title={stop.date}
                onClick={() => {
                  setPlaying(false);
                  onSceneChange(stop.date);
                }}
              >
                <span className="tick-dot" />
                <span className="tick-date">{stop.date.slice(8, 10)}-{stop.date.slice(5, 7)}</span>
              </button>
            ))
          : scenes.map((scene: TimelineScene) => (
              <button
                key={scene.itemId}
                type="button"
                className={`timeline-tick ${scene.date === activeSceneDate ? "is-active" : ""}`}
                style={{ left: `${fractionForDate(scene.date, fallbackWindow) * 100}%` }}
                title={`${scene.date}${scene.cloudCover === null ? "" : ` · ${Math.round(scene.cloudCover)}% cloud`}`}
                aria-label={`Go to ${scene.date}`}
                onClick={() => {
                  setPlaying(false);
                  onSceneChange(scene.date);
                }}
              >
                <span className="tick-dot" />
                <span className="tick-date">{scene.date.slice(8, 10)}-{scene.date.slice(5, 7)}</span>
              </button>
            ))}
        <div
          className="timeline-knob"
          role="slider"
          tabIndex={0}
          aria-label="Timeline position"
          aria-valuemin={0}
          aria-valuemax={Math.max(0, (orderedStops.length ? orderedStops.length : scenes.length) - 1)}
          aria-valuenow={orderedStops.length ? activeStopIndex : Math.max(0, scenes.findIndex((scene) => scene.date === activeSceneDate))}
          aria-valuetext={activeScene?.date ?? undefined}
          style={{ left: `${knobFraction * 100}%` }}
          onKeyDown={handleKeyDown}
        />
      </div>
      <p className="timeline-readout">
        {activeScene?.cloudCover != null && <span>{Math.round(activeScene.cloudCover)}% cloud</span>}
      </p>
    </div>
  );
}

export default TimelineBar;