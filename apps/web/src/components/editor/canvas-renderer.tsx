"use client";

import { useRef, useEffect, useCallback, useMemo } from "react";
import { useTimelineStore } from "@/stores/timeline-store";
import { useMediaStore, type MediaItem } from "@/stores/media-store";
import { usePlaybackStore } from "@/stores/playback-store";
import { useEditorStore } from "@/stores/editor-store";
import { useProjectStore } from "@/stores/project-store";
import { TimelineElement, TimelineTrack } from "@/types/timeline";

interface ActiveElement {
  element: TimelineElement;
  track: TimelineTrack;
  mediaItem: MediaItem | null;
}

interface CanvasRendererProps {
  width: number;
  height: number;
  className?: string;
}

// Single video source manager like CapCut with predictive loading
class VideoSourceManager {
  private videos = new Map<string, HTMLVideoElement>();
  private loadingPromises = new Map<string, Promise<void>>();
  private frameCache = new Map<string, Map<number, ImageBitmap>>();
  private currentSeeks = new Map<string, Promise<void>>();
  private preloadQueue = new Set<string>();
  private lastRequestedTime = new Map<string, number>();

  getVideo(src: string): HTMLVideoElement {
    if (!this.videos.has(src)) {
      const video = document.createElement("video");
      video.src = src;
      video.muted = true;
      video.preload = "metadata";
      // Disable browser's own seeking optimizations
      video.setAttribute("playsinline", "true");
      this.videos.set(src, video);

      const loadPromise = new Promise<void>((resolve, reject) => {
        video.addEventListener("loadeddata", () => resolve(), { once: true });
        video.addEventListener("error", reject, { once: true });
      });
      this.loadingPromises.set(src, loadPromise);
      this.frameCache.set(src, new Map());
    }

    return this.videos.get(src)!;
  }

  async ensureLoaded(src: string): Promise<void> {
    this.getVideo(src);
    const promise = this.loadingPromises.get(src);
    if (promise) {
      await promise;
    }
  }

  // CapCut-style: seek once, extract frame, cache it + predictive loading
  async getFrameAt(src: string, time: number): Promise<ImageBitmap | null> {
    const video = this.getVideo(src);
    await this.ensureLoaded(src);

    // Round to frame boundary for caching (use project FPS)
    const frameTime = Math.round(time * 30) / 30; // TODO: Use actual project FPS

    const cache = this.frameCache.get(src)!;
    if (cache.has(frameTime)) {
      // Start predictive loading for nearby frames
      this.startPredictiveLoading(src, time);
      return cache.get(frameTime)!;
    }

    // Track scrubbing direction for smarter preloading
    const lastTime = this.lastRequestedTime.get(src) || time;
    this.lastRequestedTime.set(src, time);
    const scrubbingDirection = time > lastTime ? 1 : -1;

    // Extract this frame synchronously for frame accuracy
    const bitmap = await this.extractFrame(src, time);

    // Start background preloading only after we have the current frame
    if (bitmap) {
      this.startPredictiveLoading(src, time, scrubbingDirection);
    }

    return bitmap;
  }

  private async extractFrame(
    src: string,
    time: number
  ): Promise<ImageBitmap | null> {
    const video = this.getVideo(src);
    const frameTime = Math.round(time * 30) / 30;
    const cache = this.frameCache.get(src)!;

    // Ensure only one seek per video at a time
    const seekKey = src;
    if (this.currentSeeks.has(seekKey)) {
      await this.currentSeeks.get(seekKey);
      // Check cache again after waiting
      if (cache.has(frameTime)) {
        return cache.get(frameTime)!;
      }
    }

    // Seek to exact time
    const seekPromise = this.seekToTime(video, time);
    this.currentSeeks.set(seekKey, seekPromise);

    try {
      await seekPromise;

      // Extract frame as ImageBitmap (GPU-optimized)
      if (video.readyState >= 2) {
        const bitmap = await createImageBitmap(video);
        cache.set(frameTime, bitmap);
        return bitmap;
      }
    } catch (error) {
      console.warn("Frame extraction failed:", error);
    } finally {
      this.currentSeeks.delete(seekKey);
    }

    return null;
  }

  // After Effects style predictive loading
  private startPredictiveLoading(
    src: string,
    currentTime: number,
    direction: number = 1
  ) {
    const key = `${src}-${currentTime}`;
    if (this.preloadQueue.has(key)) return;

    this.preloadQueue.add(key);

    // Background preload next 5 frames in scrubbing direction (reduced for performance)
    setTimeout(async () => {
      const frameInterval = 1 / 30; // TODO: Use project FPS
      const framesToPreload = 5; // Reduced to prevent overwhelming

      for (let i = 1; i <= framesToPreload; i++) {
        const preloadTime = currentTime + direction * i * frameInterval;
        const frameTime = Math.round(preloadTime * 30) / 30;

        const cache = this.frameCache.get(src)!;
        if (!cache.has(frameTime)) {
          // Don't await - let it load in background
          this.extractFrame(src, preloadTime).catch(() => {
            // Ignore preload failures
          });

          // Small delay between preloads to not overwhelm
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
      }

      this.preloadQueue.delete(key);
    }, 100); // Longer delay to prioritize current frame
  }

  private async seekToTime(
    video: HTMLVideoElement,
    time: number
  ): Promise<void> {
    if (Math.abs(video.currentTime - time) < 0.01) return; // Already there

    return new Promise<void>((resolve) => {
      const onSeeked = () => {
        video.removeEventListener("seeked", onSeeked);
        resolve();
      };

      video.addEventListener("seeked", onSeeked);
      video.currentTime = time;

      // Fallback timeout
      setTimeout(() => {
        video.removeEventListener("seeked", onSeeked);
        resolve();
      }, 100);
    });
  }

  cleanup() {
    // Cleanup ImageBitmaps
    for (const cache of this.frameCache.values()) {
      for (const bitmap of cache.values()) {
        bitmap.close();
      }
      cache.clear();
    }
    this.videos.clear();
    this.loadingPromises.clear();
    this.frameCache.clear();
    this.currentSeeks.clear();
    this.preloadQueue.clear();
    this.lastRequestedTime.clear();
  }
}

const videoManager = new VideoSourceManager();

export function CanvasRenderer({
  width,
  height,
  className,
}: CanvasRendererProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { tracks } = useTimelineStore();
  const { mediaItems } = useMediaStore();
  const { currentTime } = usePlaybackStore();
  const { canvasSize } = useEditorStore();
  const { activeProject } = useProjectStore();

  // Convert timeline time to frame number
  const timeToFrame = useCallback(
    (time: number): number => {
      const fps = activeProject?.fps || 30;
      return Math.round(time * fps);
    },
    [activeProject?.fps]
  );

  // Convert frame number to time
  const frameToTime = useCallback(
    (frame: number): number => {
      const fps = activeProject?.fps || 30;
      return frame / fps;
    },
    [activeProject?.fps]
  );

  // Get active elements at current time (frame-based)
  const getActiveElements = useCallback((): ActiveElement[] => {
    const activeElements: ActiveElement[] = [];
    const currentFrame = timeToFrame(currentTime);

    tracks.forEach((track) => {
      track.elements.forEach((element) => {
        if (element.hidden) return;

        const elementStartFrame = timeToFrame(element.startTime);
        const elementEndFrame = timeToFrame(
          element.startTime +
            (element.duration - element.trimStart - element.trimEnd)
        );

        // Frame-based range check (no floating point issues)
        if (
          currentFrame >= elementStartFrame &&
          currentFrame < elementEndFrame
        ) {
          let mediaItem = null;
          if (element.type === "media") {
            mediaItem =
              element.mediaId === "test"
                ? null
                : mediaItems.find((item) => item.id === element.mediaId) ||
                  null;
          }
          activeElements.push({ element, track, mediaItem });
        }
      });
    });

    return activeElements;
  }, [tracks, mediaItems, currentTime, timeToFrame]);

  // Calculate video time for an element
  const calculateVideoTime = useCallback(
    (element: TimelineElement): number => {
      const relativeTime = currentTime - element.startTime;
      const videoTime = element.trimStart + relativeTime;
      return Math.max(0, Math.min(element.duration, videoTime));
    },
    [currentTime]
  );

  // Render function with double buffering
  const render = useCallback(async () => {
    const startTime = performance.now();

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Create offscreen canvas for double buffering
    const offscreen = document.createElement("canvas");
    offscreen.width = width;
    offscreen.height = height;
    const offscreenCtx = offscreen.getContext("2d");
    if (!offscreenCtx) return;

    // Clear offscreen canvas
    offscreenCtx.clearRect(0, 0, width, height);

    // Set background
    const backgroundColor =
      activeProject?.backgroundType === "blur"
        ? "transparent"
        : activeProject?.backgroundColor || "#000000";

    if (backgroundColor !== "transparent") {
      offscreenCtx.fillStyle = backgroundColor;
      offscreenCtx.fillRect(0, 0, width, height);
    }

    const activeElements = getActiveElements();

    // Render media elements first (background layer)
    for (const elementData of activeElements) {
      const { element, mediaItem } = elementData;

      if (element.type === "media" && mediaItem) {
        if (mediaItem.type === "video") {
          await renderVideoElement(offscreenCtx, element, mediaItem);
        } else if (mediaItem.type === "image") {
          await renderImageElement(offscreenCtx, element, mediaItem);
        }
      }
    }

    // Render text elements last (on top)
    for (const elementData of activeElements) {
      const { element } = elementData;

      if (element.type === "text") {
        renderTextElement(offscreenCtx, element);
      }
    }

    // Copy complete frame to visible canvas in one operation
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(offscreen, 0, 0);

    // Render complete
  }, [width, height, activeProject, getActiveElements]);

  // CapCut-style video rendering: single source + frame extraction
  const renderVideoElement = async (
    ctx: CanvasRenderingContext2D,
    element: TimelineElement,
    mediaItem: MediaItem
  ) => {
    try {
      const videoTime = calculateVideoTime(element);

      // Get specific frame from single video source
      const frameBitmap = await videoManager.getFrameAt(
        mediaItem.url!,
        videoTime
      );

      if (frameBitmap) {
        // Calculate aspect ratio and positioning
        const videoAspect = frameBitmap.width / frameBitmap.height;
        const canvasAspect = width / height;

        let drawWidth, drawHeight, drawX, drawY;

        if (videoAspect > canvasAspect) {
          // Video is wider - fit to width
          drawWidth = width;
          drawHeight = width / videoAspect;
          drawX = 0;
          drawY = (height - drawHeight) / 2;
        } else {
          // Video is taller - fit to height
          drawHeight = height;
          drawWidth = height * videoAspect;
          drawX = (width - drawWidth) / 2;
          drawY = 0;
        }

        // Draw the cached frame bitmap (GPU-optimized)
        ctx.drawImage(frameBitmap, drawX, drawY, drawWidth, drawHeight);
      } else {
        // Frame accuracy is critical - show loading indicator for correct time
        ctx.fillStyle = "#1a1a1a";
        ctx.fillRect(0, 0, width, height);

        // Subtle loading indicator
        ctx.fillStyle = "#666";
        ctx.font = "14px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("⏳", width / 2, height / 2);
      }
    } catch (error) {
      console.error("Failed to render video element:", error);
      // Draw fallback
      ctx.fillStyle = "#333";
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = "#fff";
      ctx.font = "16px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Video Loading...", width / 2, height / 2);
    }
  };

  // Render image element
  const renderImageElement = async (
    ctx: CanvasRenderingContext2D,
    element: TimelineElement,
    mediaItem: MediaItem
  ) => {
    try {
      const img = new Image();
      img.src = mediaItem.url!;

      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
      });

      // Calculate aspect ratio and positioning
      const imgAspect = img.width / img.height;
      const canvasAspect = width / height;

      let drawWidth, drawHeight, drawX, drawY;

      if (imgAspect > canvasAspect) {
        // Image is wider - fit to width
        drawWidth = width;
        drawHeight = width / imgAspect;
        drawX = 0;
        drawY = (height - drawHeight) / 2;
      } else {
        // Image is taller - fit to height
        drawHeight = height;
        drawWidth = height * imgAspect;
        drawX = (width - drawWidth) / 2;
        drawY = 0;
      }

      ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);
    } catch (error) {
      console.error("Failed to render image element:", error);
    }
  };

  // Render text element
  const renderTextElement = (
    ctx: CanvasRenderingContext2D,
    element: TimelineElement
  ) => {
    try {
      if (element.type !== "text") return;

      // Convert element coordinates to canvas coordinates
      const scaleX = width / canvasSize.width;
      const scaleY = height / canvasSize.height;

      const x = (canvasSize.width / 2 + element.x) * scaleX;
      const y = (canvasSize.height / 2 + element.y) * scaleY;

      ctx.save();

      // Set text properties with fallback font
      const fontSize = Math.max(
        12,
        element.fontSize * Math.min(scaleX, scaleY)
      );
      const fontFamily = element.fontFamily || "Arial, sans-serif";
      ctx.font = `${element.fontWeight || "normal"} ${element.fontStyle || "normal"} ${fontSize}px ${fontFamily}`;
      ctx.fillStyle = element.color || "#ffffff";
      ctx.textAlign = (element.textAlign as CanvasTextAlign) || "center";
      ctx.textBaseline = "middle";
      ctx.globalAlpha = element.opacity ?? 1;

      // Apply rotation if any
      if (element.rotation && element.rotation !== 0) {
        ctx.translate(x, y);
        ctx.rotate((element.rotation * Math.PI) / 180);
        ctx.translate(-x, -y);
      }

      // Draw background if specified
      if (
        element.backgroundColor &&
        element.backgroundColor !== "transparent"
      ) {
        const metrics = ctx.measureText(element.content || "");
        const padding = 8 * Math.min(scaleX, scaleY);

        ctx.fillStyle = element.backgroundColor;
        ctx.fillRect(
          x - metrics.width / 2 - padding,
          y - fontSize / 2 - padding / 2,
          metrics.width + padding * 2,
          fontSize + padding
        );

        ctx.fillStyle = element.color || "#ffffff";
      }

      // Draw text
      ctx.fillText(element.content || "", x, y);

      ctx.restore();
    } catch (error) {
      console.error("Failed to render text element:", error);
    }
  };

  // Better debouncing with async operation prevention
  const debouncedRender = useMemo(() => {
    let timeoutId: NodeJS.Timeout;
    let isRendering = false;
    let callCount = 0;
    return async () => {
      callCount++;

      // Skip if already rendering
      if (isRendering) {
        return;
      }
      clearTimeout(timeoutId);
      timeoutId = setTimeout(async () => {
        if (isRendering) return;

        isRendering = true;
        try {
          await render();
        } finally {
          isRendering = false;
        }
      }, 16); // ~60fps max
    };
  }, [render, currentTime]);

  // Re-render when currentTime changes
  useEffect(() => {
    debouncedRender();
  }, [debouncedRender]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      videoManager.cleanup();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className={className}
      style={{ width: "100%", height: "100%" }}
    />
  );
}
