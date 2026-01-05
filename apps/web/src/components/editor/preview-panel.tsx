"use client";

import { useTimelineStore } from "@/stores/timeline-store";
import { TimelineElement, TimelineTrack } from "@/types/timeline";
import { useMediaStore } from "@/stores/media-store";
import { MediaFile } from "@/types/media";
import { usePlaybackStore } from "@/stores/playback-store";
import { useEditorStore } from "@/stores/editor-store";
import { useAspectRatio } from "@/hooks/use-aspect-ratio";
import { AudioPlayer } from "@/components/ui/audio-player";
import { CanvasRenderer } from "./canvas-renderer";
import { Button } from "@/components/ui/button";
import { Play, Pause, Expand, SkipBack, SkipForward } from "lucide-react";
import { useState, useRef, useEffect, useCallback } from "react";
import { renderTimelineFrame } from "@/lib/timeline-renderer";
import { cn } from "@/lib/utils";
import { formatTimeCode } from "@/lib/time";
import { EditableTimecode } from "@/components/ui/editable-timecode";
import { useFrameCache } from "@/hooks/use-frame-cache";
import { useSceneStore } from "@/stores/scene-store";
import {
  DEFAULT_CANVAS_SIZE,
  DEFAULT_FPS,
  useProjectStore,
} from "@/stores/project-store";
import { TextElementDragState } from "@/types/editor";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { LayoutGuideOverlay } from "./layout-guide-overlay";
import { Label } from "../ui/label";
import { SocialsIcon } from "../icons";
import { PLATFORM_LAYOUTS, type PlatformLayout } from "@/stores/editor-store";

interface ActiveElement {
  element: TimelineElement;
  track: TimelineTrack;
  mediaItem: MediaFile | null;
}

export function PreviewPanel() {
  const { tracks, getTotalDuration, updateTextElement } = useTimelineStore();
  const { mediaFiles } = useMediaStore();
  const { currentTime, toggle, setCurrentTime } = usePlaybackStore();
  const { isPlaying, volume, muted } = usePlaybackStore();
  const { activeProject } = useProjectStore();
  const { currentScene } = useSceneStore();
  const previewRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { getCachedFrame, cacheFrame, invalidateCache, preRenderNearbyFrames } =
    useFrameCache();
  const lastFrameTimeRef = useRef(0);
  const renderSeqRef = useRef(0);
  const offscreenCanvasRef = useRef<OffscreenCanvas | HTMLCanvasElement | null>(
    null
  );

  const audioContextRef = useRef<AudioContext | null>(null);
  const audioGainRef = useRef<GainNode | null>(null);
  const audioBuffersRef = useRef<Map<string, AudioBuffer>>(new Map());
  const playingSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);
  const [previewDimensions, setPreviewDimensions] = useState({
    width: 0,
    height: 0,
  });
  const [isExpanded, setIsExpanded] = useState(false);

  const canvasSize = activeProject?.canvasSize || DEFAULT_CANVAS_SIZE;
  const [dragState, setDragState] = useState<TextElementDragState>({
    isDragging: false,
    elementId: null,
    trackId: null,
    startX: 0,
    startY: 0,
    initialElementX: 0,
    initialElementY: 0,
    currentX: 0,
    currentY: 0,
    elementWidth: 0,
    elementHeight: 0,
  });

  useEffect(() => {
    const updatePreviewSize = () => {
      if (!containerRef.current) return;

      let availableWidth, availableHeight;

      if (isExpanded) {
        const controlsHeight = 80;
        const marginSpace = 24;
        availableWidth = window.innerWidth - marginSpace;
        availableHeight = window.innerHeight - controlsHeight - marginSpace;
      } else {
        const container = containerRef.current.getBoundingClientRect();
        const computedStyle = getComputedStyle(containerRef.current);
        const paddingTop = parseFloat(computedStyle.paddingTop);
        const paddingBottom = parseFloat(computedStyle.paddingBottom);
        const paddingLeft = parseFloat(computedStyle.paddingLeft);
        const paddingRight = parseFloat(computedStyle.paddingRight);
        const gap = parseFloat(computedStyle.gap) || 16;
        const toolbar = containerRef.current.querySelector("[data-toolbar]");
        const toolbarHeight = toolbar
          ? toolbar.getBoundingClientRect().height
          : 0;

        availableWidth = container.width - paddingLeft - paddingRight;
        availableHeight =
          container.height -
          paddingTop -
          paddingBottom -
          toolbarHeight -
          (toolbarHeight > 0 ? gap : 0);
      }

      const targetRatio = canvasSize.width / canvasSize.height;
      const containerRatio = availableWidth / availableHeight;
      let width, height;

      if (containerRatio > targetRatio) {
        height = availableHeight * (isExpanded ? 0.95 : 1);
        width = height * targetRatio;
      } else {
        width = availableWidth * (isExpanded ? 0.95 : 1);
        height = width / targetRatio;
      }

      setPreviewDimensions({ width, height });
    };
    updatePreviewSize();
    const resizeObserver = new ResizeObserver(updatePreviewSize);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }
    if (isExpanded) {
      window.addEventListener("resize", updatePreviewSize);
    }

    return () => {
      resizeObserver.disconnect();
      if (isExpanded) {
        window.removeEventListener("resize", updatePreviewSize);
      }
    };
  }, [canvasSize.width, canvasSize.height, isExpanded]);

  useEffect(() => {
    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isExpanded) {
        setIsExpanded(false);
      }
    };

    if (isExpanded) {
      document.addEventListener("keydown", handleEscapeKey);
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }

    return () => {
      document.removeEventListener("keydown", handleEscapeKey);
      document.body.style.overflow = "";
    };
  }, [isExpanded]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragState.isDragging) return;

      const deltaX = e.clientX - dragState.startX;
      const deltaY = e.clientY - dragState.startY;

      const scaleRatio = previewDimensions.width / canvasSize.width;
      const newX = dragState.initialElementX + deltaX / scaleRatio;
      const newY = dragState.initialElementY + deltaY / scaleRatio;

      const halfWidth = dragState.elementWidth / scaleRatio / 2;
      const halfHeight = dragState.elementHeight / scaleRatio / 2;

      const constrainedX = Math.max(
        -canvasSize.width / 2 + halfWidth,
        Math.min(canvasSize.width / 2 - halfWidth, newX)
      );
      const constrainedY = Math.max(
        -canvasSize.height / 2 + halfHeight,
        Math.min(canvasSize.height / 2 - halfHeight, newY)
      );

      setDragState((prev) => ({
        ...prev,
        currentX: constrainedX,
        currentY: constrainedY,
      }));
    };
    const handleMouseUp = () => {
      if (dragState.isDragging && dragState.trackId && dragState.elementId) {
        updateTextElement(dragState.trackId, dragState.elementId, {
          x: dragState.currentX,
          y: dragState.currentY,
        });
      }
      setDragState((prev) => ({ ...prev, isDragging: false }));
    };

    if (dragState.isDragging) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "grabbing";
      document.body.style.userSelect = "none";
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [dragState, previewDimensions, canvasSize, updateTextElement]);

  // Clear the frame cache when background settings change since they affect rendering
  useEffect(() => {
    invalidateCache();
  }, [
    mediaFiles,
    activeProject?.backgroundColor,
    activeProject?.backgroundType,
    invalidateCache,
  ]);

  const handleTextMouseDown = (
    e: React.MouseEvent<HTMLDivElement>,
    element: any,
    trackId: string
  ) => {
    e.preventDefault();
    e.stopPropagation();

    const rect = e.currentTarget.getBoundingClientRect();
    const scaleX = previewDimensions.width / rect.width;
    const scaleY = previewDimensions.height / rect.height;

    setDragState({
      isDragging: true,
      elementId: element.id,
      trackId,
      startX: e.clientX,
      startY: e.clientY,
      initialElementX: element.x,
      initialElementY: element.y,
      currentX: element.x,
      currentY: element.y,
      elementWidth: element.width || 0,
      elementHeight: element.height || 0,
    });
  };

  const handleSkipBack = () => {
    const newTime = Math.max(0, currentTime - 5);
    setCurrentTime(newTime);
  };

  const handleSkipForward = () => {
    const newTime = Math.min(getTotalDuration(), currentTime + 5);
    setCurrentTime(newTime);
  };

  const getActiveElements = (): ActiveElement[] => {
    const activeElements: ActiveElement[] = [];

    tracks.forEach((track) => {
      track.elements.forEach((element) => {
        if (element.hidden) return;

        const elementStart = element.startTime;
        const elementEnd =
          element.startTime +
          (element.duration - element.trimStart - element.trimEnd);

        if (currentTime >= elementStart && currentTime < elementEnd) {
          let mediaItem = null;
          if (element.type === "media") {
            mediaItem =
              element.mediaId === "test"
                ? null
                : mediaFiles.find((item) => item.id === element.mediaId) ||
                  null;
          }
          activeElements.push({ element, track, mediaItem });
        }
      });
    });

    return activeElements;
  };

  const activeElements = getActiveElements();

  // Get audio elements that need HTML audio players
  const audioElements = activeElements.filter(
    (e) => e.element.type === "media" && e.mediaItem?.type === "audio"
  );

  const shouldRenderPreview = true;

  // Note: Blur background and visual elements now handled by CanvasRenderer
  // Note: Element rendering now handled by CanvasRenderer

  return (
    <>
      <div className="h-full w-full flex flex-col min-h-0 min-w-0 bg-panel rounded-sm relative">
        <div
          ref={containerRef}
          className="flex-1 flex flex-col items-center justify-center min-h-0 min-w-0"
        >
          <div className="flex-1" />
          {shouldRenderPreview ? (
            <div
              ref={previewRef}
              className="relative overflow-hidden border"
              style={{
                width: previewDimensions.width,
                height: previewDimensions.height,
                background:
                  activeProject?.backgroundType === "blur"
                    ? "transparent"
                    : activeProject?.backgroundColor || "#000000",
              }}
            >
              {/* Canvas renderer handles all visual elements */}
              <CanvasRenderer
                width={previewDimensions.width}
                height={previewDimensions.height}
                className="absolute inset-0"
              />

              {/* Audio elements still use HTML audio for playback */}
              {audioElements.map((elementData) => (
                <AudioPlayer
                  key={elementData.element.id}
                  src={elementData.mediaItem!.url!}
                  clipStartTime={elementData.element.startTime}
                  trimStart={elementData.element.trimStart}
                  trimEnd={elementData.element.trimEnd}
                  clipDuration={elementData.element.duration}
                  trackMuted={elementData.track.muted}
                />
              ))}
              {activeElements.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                  No elements at current time
                </div>
              )}
            </div>
          ) : null}
          <div className="flex-1" />
        </div>

        <div className="flex items-center justify-between gap-2 p-4 border-t bg-background">
          <div className="flex items-center gap-2">
            <Button
              size="icon"
              variant="ghost"
              onClick={handleSkipBack}
              aria-label="Skip back 5 seconds"
            >
              <SkipBack className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              onClick={toggle}
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? (
                <Pause className="h-4 w-4" />
              ) : (
                <Play className="h-4 w-4" />
              )}
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={handleSkipForward}
              aria-label="Skip forward 5 seconds"
            >
              <SkipForward className="h-4 w-4" />
            </Button>
            <EditableTimecode
              value={currentTime}
              onChange={setCurrentTime}
              max={getTotalDuration()}
            />
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setIsExpanded(!isExpanded)}
              aria-label={isExpanded ? "Collapse" : "Expand"}
            >
              <Expand className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
