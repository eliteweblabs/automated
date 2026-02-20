import {
  RefObject,
  useCallback,
  useState,
  useRef,
  useEffect,
  useImperativeHandle,
  forwardRef,
} from 'react';
import { Box } from '@chakra-ui/react';
import html2canvas from 'html2canvas-pro';
import { BrowserOverlay } from './BrowserOverlay';
import { BrowserTabs } from './BrowserTabs';
import { BrowserToolbar } from './BrowserToolbar';
import { BrowserContent, BrowserContentRef } from './BrowserContent';

interface Page {
  id: string;
  title?: string;
  url?: string;
  favicon?: string;
  isSkeleton?: boolean;
}

export interface BrowserContainerRef {
  stopRecording: () => Promise<string | null>;
  getRecordedVideoUrl: () => string | null;
  captureScreenshot: () => string | null;
  captureCurrentFrame: () => Promise<string | null>;
}

interface BrowserContainerProps {
  containerRef: RefObject<HTMLDivElement | null>;
  contentRef: RefObject<HTMLDivElement | null>;
  recordingKey?: number;
  sessionId: string | null;
  pages: Page[];
  activePageIndex: number;
  setActivePageIndex: (index: number) => void;
  isLoading: boolean;
  isAddingTab: boolean;
  refreshPages: (sessionId: string) => void;
  handleAddTab: () => void;
  focusUrlBar?: number;
  handleCloseTab: (e: React.MouseEvent, pageId: string) => void;
  onNavigate?: (url: string) => void;
  onGoBack?: () => void;
  onGoForward?: () => void;
  onReload?: () => void;
  onOverlayClick?: () => void;
  minimalOverlay?: boolean;
  autoRecord?: boolean;
  onRecordingReady?: (videoUrl: string) => void;
  onVideoRecordingStarted?: (timestamp: number) => void;
  audioStream?: MediaStream | null;
  emptyState?: 'google' | 'skeleton';
  showLoadSkeleton?: boolean;
  readOnly?: boolean;
  freeze?: boolean;
  inspectorUrlTemplate?: string | null;
}

export const BrowserContainer = forwardRef<BrowserContainerRef, BrowserContainerProps>(
  (
    {
      containerRef,
      contentRef,
      recordingKey,
      sessionId,
      pages,
      activePageIndex,
      setActivePageIndex,
      isLoading,
      isAddingTab,
      refreshPages,
      handleAddTab,
      focusUrlBar,
      handleCloseTab,
      onNavigate,
      onGoBack,
      onGoForward,
      onReload,
      onOverlayClick,
      minimalOverlay,
      autoRecord,
      onRecordingReady,
      onVideoRecordingStarted,
      audioStream,
      emptyState,
      showLoadSkeleton,
      readOnly,
      freeze = false,
      inspectorUrlTemplate,
    },
    ref,
  ) => {
    const [isExcelMode, setIsExcelMode] = useState(false);
    const [frozenContentFrame, setFrozenContentFrame] = useState<string | null>(null);

    // Recording state
    const [isRecording, setIsRecording] = useState(false);
    const [recordedVideoUrl, setRecordedVideoUrl] = useState<string | null>(null);
    const [hasAutoStarted, setHasAutoStarted] = useState(false);

    // Recording refs
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const compositeCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const headerCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const currentSourceElementRef = useRef<HTMLCanvasElement | HTMLVideoElement | null>(null);
    const animationFrameRef = useRef<number | null>(null);
    const headerUpdateIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const html2canvasIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const onRecordingReadyRef = useRef(onRecordingReady);
    const onVideoRecordingStartedRef = useRef(onVideoRecordingStarted);
    const stopResolveRef = useRef<((url: string | null) => void) | null>(null);
    const activePageRef = useRef<Page | null>(null);
    const isExcelModeRef = useRef(isExcelMode);
    const spinnerRotationRef = useRef(0);
    const browserContentRef = useRef<BrowserContentRef>(null);
    const excelContentCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const excelCaptureIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const frameCaptureInFlightRef = useRef(false);
    const lastContentFrameRef = useRef<string | null>(null);

    useEffect(() => {
      onRecordingReadyRef.current = onRecordingReady;
    }, [onRecordingReady]);

    useEffect(() => {
      onVideoRecordingStartedRef.current = onVideoRecordingStarted;
    }, [onVideoRecordingStarted]);

    useEffect(() => {
      activePageRef.current = pages[activePageIndex] || null;
    }, [pages, activePageIndex]);

    useEffect(() => {
      isExcelModeRef.current = isExcelMode;
    }, [isExcelMode]);

    const handleFocus = () => {
      if (containerRef.current) {
        containerRef.current.scrollIntoView({ behavior: 'auto', block: 'start' });
      }
    };

    const handleSelectTab = useCallback(
      (index: number) => {
        setIsExcelMode(false);
        setActivePageIndex(index);
      },
      [setActivePageIndex],
    );

    const handleOpenExcel = useCallback(() => {
      setIsExcelMode(true);
    }, []);

    // Find canvas or video element in iframe document
    const findCaptureableElement = useCallback(
      (
        doc: Document,
        depth = 0,
        verbose = true,
      ): HTMLCanvasElement | HTMLVideoElement | null => {
        const indent = '  '.repeat(depth);

        // Search for canvas elements
        const canvases = doc.querySelectorAll('canvas');
        for (const canvas of canvases) {
          if (canvas.width > 0 && canvas.height > 0) {
            if (verbose) {
              console.log(
                `${indent}[RECORDING] Found valid canvas: ${canvas.width}x${canvas.height}`,
              );
            }
            return canvas as HTMLCanvasElement;
          }
        }

        // Search for video elements
        const videos = doc.querySelectorAll('video');
        for (const video of videos) {
          if (video.videoWidth > 0 || video.readyState >= 2) {
            if (verbose) {
              console.log(
                `${indent}[RECORDING] Found valid video: ${video.videoWidth}x${video.videoHeight}`,
              );
            }
            return video as HTMLVideoElement;
          }
        }

        // Search in shadow roots
        const allElements = doc.querySelectorAll('*');
        for (const el of allElements) {
          if (el.shadowRoot) {
            const shadowCanvas = el.shadowRoot.querySelector('canvas');
            if (shadowCanvas && (shadowCanvas as HTMLCanvasElement).width > 0) {
              if (verbose) {
                console.log(`${indent}[RECORDING] Found canvas in shadow root`);
              }
              return shadowCanvas as HTMLCanvasElement;
            }
            const shadowVideo = el.shadowRoot.querySelector('video');
            if (
              shadowVideo &&
              ((shadowVideo as HTMLVideoElement).videoWidth > 0 ||
                (shadowVideo as HTMLVideoElement).readyState >= 2)
            ) {
              if (verbose) {
                console.log(`${indent}[RECORDING] Found video in shadow root`);
              }
              return shadowVideo as HTMLVideoElement;
            }
          }
        }

        // Search in nested iframes
        const iframes = doc.querySelectorAll('iframe');
        for (const nestedIframe of iframes) {
          try {
            const nestedDoc = (nestedIframe as HTMLIFrameElement).contentWindow?.document;
            if (nestedDoc) {
              const nestedElement = findCaptureableElement(nestedDoc, depth + 1, verbose);
              if (nestedElement) return nestedElement;
            }
          } catch (e) {
            continue;
          }
        }

        return null;
      },
      [],
    );

    // Wait for canvas/video to be available
    const waitForCaptureableElement = useCallback(
      async (
        iframe: HTMLIFrameElement,
        maxAttempts = 20,
        intervalMs = 300,
      ): Promise<HTMLCanvasElement | HTMLVideoElement | null> => {
        console.log(`[RECORDING] Waiting for canvas/video in iframe (max ${maxAttempts} attempts)`);

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          if (attempt % 5 === 0) {
            console.log(`[RECORDING] Attempt ${attempt + 1}/${maxAttempts}...`);
          }

          const iframeDocument = iframe.contentWindow?.document;
          if (iframeDocument) {
            const element = findCaptureableElement(iframeDocument);
            if (element) {
              console.log(
                `[RECORDING] Found ${element.tagName.toLowerCase()} after ${attempt + 1} attempts`,
              );
              return element;
            }
          }

          await new Promise((resolve) => setTimeout(resolve, intervalMs));
        }

        console.log('[RECORDING] No canvas/video found after all attempts');
        return null;
      },
      [findCaptureableElement],
    );

    // Capture header snapshot using html2canvas
    const updateHeaderSnapshot = useCallback(
      async (container: HTMLElement, headerHeight: number, containerWidth: number) => {
        try {
          const images = container.querySelectorAll('img');
          await Promise.all(
            Array.from(images).map((img) => {
              if (img.complete) return Promise.resolve();
              return new Promise((resolve) => {
                img.onload = resolve;
                img.onerror = resolve;
              });
            }),
          );

          const canvas = await html2canvas(container, {
            useCORS: true,
            allowTaint: true,
            logging: false,
            scale: window.devicePixelRatio,
            width: containerWidth,
            height: headerHeight,
            x: 0,
            y: 0,
            scrollX: -window.scrollX,
            scrollY: -window.scrollY,
            windowWidth: document.documentElement.clientWidth,
            windowHeight: document.documentElement.clientHeight,
            ignoreElements: (element) => {
              return (
                element.tagName.toLowerCase() === 'iframe' ||
                element.classList.contains('browser-content-area')
              );
            },
            onclone: (clonedDoc) => {
              const inputs = clonedDoc.querySelectorAll('input');
              inputs.forEach((input) => {
                const div = clonedDoc.createElement('div');
                const computedStyle = window.getComputedStyle(input);
                div.textContent = input.value || input.placeholder;
                div.style.cssText = computedStyle.cssText;
                div.style.display = 'flex';
                div.style.alignItems = 'center';
                div.style.overflow = 'hidden';
                div.style.whiteSpace = 'nowrap';
                input.replaceWith(div);
              });
            },
          });
          headerCanvasRef.current = canvas;
        } catch (e) {
          console.error('[RECORDING] Failed to capture header snapshot:', e);
        }
      },
      [],
    );

    // Capture Excel content with SVG fix - used for initial capture and periodic updates
    const captureExcelContentOnce = useCallback(async (contentArea: Element) => {
      try {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

        const contentRect = contentArea.getBoundingClientRect();

        const capturedCanvas = await html2canvas(contentArea as HTMLElement, {
          useCORS: true,
          allowTaint: true,
          logging: false,
          scale: window.devicePixelRatio,
          width: contentRect.width,
          height: contentRect.height,
          backgroundColor: '#ffffff',
          onclone: (clonedDoc) => {
            // Fix SVG <use> elements that reference symbols via xlink:href
            const useElements = clonedDoc.querySelectorAll('use');
            useElements.forEach((useEl) => {
              const href = useEl.getAttribute('xlink:href') || useEl.getAttribute('href');
              if (href && href.startsWith('#')) {
                const symbolId = href.slice(1);
                const symbol = document.getElementById(symbolId);
                if (symbol) {
                  const svg = useEl.closest('svg');
                  if (svg) {
                    const symbolContent = symbol.cloneNode(true) as Element;
                    const viewBox = symbolContent.getAttribute('viewBox');
                    if (viewBox) {
                      svg.setAttribute('viewBox', viewBox);
                    }
                    const g = clonedDoc.createElementNS('http://www.w3.org/2000/svg', 'g');
                    Array.from(symbolContent.childNodes).forEach((child) => {
                      g.appendChild(child.cloneNode(true));
                    });
                    useEl.replaceWith(g);
                  }
                }
              }
            });
          },
        });

        excelContentCanvasRef.current = capturedCanvas;
      } catch (e) {
        console.error('[RECORDING] Excel content capture error:', e);
      }
    }, []);

    const startRecording = useCallback(async () => {
      if (recordedVideoUrl) {
        URL.revokeObjectURL(recordedVideoUrl);
        setRecordedVideoUrl(null);
      }
      chunksRef.current = [];

      try {
        const container = containerRef?.current;
        if (!container) {
          throw new Error('Container element not found for recording');
        }

        const containerRect = container.getBoundingClientRect();
        const contentArea = container.querySelector('.browser-content-area');
        const contentRect = contentArea?.getBoundingClientRect();
        const headerHeight = contentRect ? contentRect.top - containerRect.top : 80;

        // Capture initial header snapshot
        await updateHeaderSnapshot(container, headerHeight, containerRect.width);

        // Create composite canvas
        const compositeCanvas = document.createElement('canvas');
        compositeCanvas.width = containerRect.width * window.devicePixelRatio;
        compositeCanvas.height = containerRect.height * window.devicePixelRatio;
        compositeCanvasRef.current = compositeCanvas;

        const ctx = compositeCanvas.getContext('2d', { alpha: false });
        if (!ctx) {
          throw new Error('Failed to get canvas context');
        }
        ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

        // Try to get iframe source element if not in Excel mode
        let sourceElement: HTMLCanvasElement | HTMLVideoElement | null = null;
        if (!isExcelMode) {
          const activePage = pages[activePageIndex];
          if (activePage && !activePage.isSkeleton) {
            const iframe = browserContentRef.current?.getIframeForPage(activePage.id);
            if (iframe) {
              console.log('[RECORDING] Waiting for canvas/video in iframe...');
              sourceElement = await waitForCaptureableElement(iframe);
              currentSourceElementRef.current = sourceElement;
            }
          }
        }

        let stream: MediaStream;

        if (sourceElement || isExcelMode) {
          // Use optimized composite mode for iframe content or Excel mode
          // Excel mode draws from excelContentCanvasRef which is populated by the Excel capture effect
          console.log('[RECORDING] Using composite mode', isExcelMode ? '(Excel)' : '(iframe)');

          // If starting in Excel mode, capture initial content before starting the frame loop
          if (isExcelMode && contentArea) {
            await captureExcelContentOnce(contentArea);
          }

          const drawFrame = () => {
            const currentContainerRect = container.getBoundingClientRect();
            const currentContentRect = contentArea?.getBoundingClientRect();
            const currentHeaderHeight = currentContentRect
              ? currentContentRect.top - currentContainerRect.top
              : headerHeight;

            // Clear canvas
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, currentContainerRect.width, currentContainerRect.height);

            // Draw header snapshot
            if (headerCanvasRef.current) {
              const headerCanvas = headerCanvasRef.current;
              ctx.drawImage(
                headerCanvas,
                0,
                0,
                headerCanvas.width,
                headerCanvas.height,
                0,
                0,
                currentContainerRect.width,
                currentHeaderHeight,
              );
            } else {
              ctx.fillStyle = '#f3f4f6';
              ctx.fillRect(0, 0, currentContainerRect.width, currentHeaderHeight);
            }

            // Draw content area
            const destWidth = currentContainerRect.width;
            const destHeight = currentContainerRect.height - currentHeaderHeight;
            const activePage = activePageRef.current;

            if (isExcelModeRef.current) {
              // Excel mode - draw from cached html2canvas capture
              if (excelContentCanvasRef.current) {
                try {
                  ctx.drawImage(
                    excelContentCanvasRef.current,
                    0,
                    0,
                    excelContentCanvasRef.current.width,
                    excelContentCanvasRef.current.height,
                    0,
                    currentHeaderHeight,
                    destWidth,
                    destHeight,
                  );
                } catch (e) {
                  ctx.fillStyle = '#ffffff';
                  ctx.fillRect(0, currentHeaderHeight, destWidth, destHeight);
                }
              } else {
                // No cached content yet, draw white
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, currentHeaderHeight, destWidth, destHeight);
              }
            } else if (activePage?.isSkeleton) {
              // Loading state
              ctx.fillStyle = '#ffffff';
              ctx.fillRect(0, currentHeaderHeight, destWidth, destHeight);

              const centerX = destWidth / 2;
              const centerY = currentHeaderHeight + destHeight / 2;
              const spinnerRadius = 24;
              const spinnerLineWidth = 4;

              spinnerRotationRef.current = (spinnerRotationRef.current + 0.1) % (Math.PI * 2);

              ctx.save();
              ctx.translate(centerX, centerY - 20);
              ctx.rotate(spinnerRotationRef.current);

              ctx.beginPath();
              ctx.arc(0, 0, spinnerRadius, 0, Math.PI * 1.5);
              ctx.strokeStyle = '#e5e7eb';
              ctx.lineWidth = spinnerLineWidth;
              ctx.lineCap = 'round';
              ctx.stroke();

              ctx.beginPath();
              ctx.arc(0, 0, spinnerRadius, Math.PI * 1.5, Math.PI * 2);
              ctx.strokeStyle = '#3b82f6';
              ctx.lineWidth = spinnerLineWidth;
              ctx.lineCap = 'round';
              ctx.stroke();

              ctx.restore();

              ctx.fillStyle = '#6b7280';
              ctx.font = '500 16px system-ui, -apple-system, sans-serif';
              ctx.textAlign = 'center';
              ctx.fillText('Opening new tab...', centerX, centerY + 40);
            } else {
              // Draw iframe canvas/video content
              try {
                const currentSource = currentSourceElementRef.current;
                if (currentSource) {
                  let sourceWidth: number;
                  let sourceHeight: number;

                  if (currentSource instanceof HTMLCanvasElement) {
                    sourceWidth = currentSource.width;
                    sourceHeight = currentSource.height;
                  } else {
                    sourceWidth = currentSource.videoWidth || currentSource.width;
                    sourceHeight = currentSource.videoHeight || currentSource.height;
                  }

                  ctx.drawImage(
                    currentSource,
                    0,
                    0,
                    sourceWidth,
                    sourceHeight,
                    0,
                    currentHeaderHeight,
                    destWidth,
                    destHeight,
                  );
                }
              } catch (e) {
                // Canvas might be tainted, ignore
              }
            }

            animationFrameRef.current = requestAnimationFrame(drawFrame);
          };

          drawFrame();
          stream = compositeCanvas.captureStream(20);
        } else {
          // Fallback: use html2canvas for Excel mode or when no canvas/video found
          console.log('[RECORDING] Using html2canvas mode for content capture');

          const captureFrame = async () => {
            try {
              const currentContainerRect = container.getBoundingClientRect();
              const currentContentRect = contentArea?.getBoundingClientRect();
              const currentHeaderHeight = currentContentRect
                ? currentContentRect.top - currentContainerRect.top
                : headerHeight;

              // Clear and draw header
              ctx.fillStyle = '#ffffff';
              ctx.fillRect(0, 0, currentContainerRect.width, currentContainerRect.height);

              if (headerCanvasRef.current) {
                ctx.drawImage(
                  headerCanvasRef.current,
                  0,
                  0,
                  headerCanvasRef.current.width,
                  headerCanvasRef.current.height,
                  0,
                  0,
                  currentContainerRect.width,
                  currentHeaderHeight,
                );
              }

              // Capture content area with html2canvas
              if (contentArea) {
                const contentCanvas = await html2canvas(contentArea as HTMLElement, {
                  useCORS: true,
                  allowTaint: true,
                  logging: false,
                  scale: window.devicePixelRatio,
                  width: currentContainerRect.width,
                  height: currentContainerRect.height - currentHeaderHeight,
                });

                ctx.drawImage(
                  contentCanvas,
                  0,
                  0,
                  contentCanvas.width,
                  contentCanvas.height,
                  0,
                  currentHeaderHeight,
                  currentContainerRect.width,
                  currentContainerRect.height - currentHeaderHeight,
                );
              }
            } catch (e) {
              console.error('[RECORDING] html2canvas capture error:', e);
            }
          };

          await captureFrame();
          html2canvasIntervalRef.current = setInterval(captureFrame, 100);
          stream = compositeCanvas.captureStream(30);
        }

        if (!stream || stream.getVideoTracks().length === 0) {
          throw new Error('Failed to capture stream from composite canvas');
        }

        streamRef.current = stream;

        const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
          ? 'video/webm;codecs=vp9'
          : MediaRecorder.isTypeSupported('video/webm;codecs=vp8')
            ? 'video/webm;codecs=vp8'
            : 'video/webm';

        const mediaRecorder = new MediaRecorder(stream, {
          mimeType,
          videoBitsPerSecond: 3000000,
        });

        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            chunksRef.current.push(event.data);
          }
        };

        mediaRecorder.onstop = () => {
          if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
          }

          if (html2canvasIntervalRef.current) {
            clearInterval(html2canvasIntervalRef.current);
            html2canvasIntervalRef.current = null;
          }

          if (headerUpdateIntervalRef.current) {
            clearInterval(headerUpdateIntervalRef.current);
            headerUpdateIntervalRef.current = null;
          }

          if (excelCaptureIntervalRef.current) {
            clearInterval(excelCaptureIntervalRef.current);
            excelCaptureIntervalRef.current = null;
          }

          const blob = new Blob(chunksRef.current, { type: mimeType });
          const url = URL.createObjectURL(blob);
          setRecordedVideoUrl(url);

          if (streamRef.current) {
            streamRef.current.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
          }

          if (onRecordingReadyRef.current) {
            onRecordingReadyRef.current(url);
          }

          if (stopResolveRef.current) {
            stopResolveRef.current(url);
            stopResolveRef.current = null;
          }
        };

        if (stream.getVideoTracks()[0]) {
          stream.getVideoTracks()[0].onended = () => {
            if (mediaRecorderRef.current?.state !== 'inactive') {
              mediaRecorderRef.current?.stop();
            }
            setIsRecording(false);
          };
        }

        mediaRecorder.start(100);
        mediaRecorderRef.current = mediaRecorder;
        setIsRecording(true);

        if (onVideoRecordingStartedRef.current) {
          onVideoRecordingStartedRef.current(Date.now());
        }

        // Update header periodically
        headerUpdateIntervalRef.current = setInterval(() => {
          if (container) {
            const rect = container.getBoundingClientRect();
            const cRect = contentArea?.getBoundingClientRect();
            const hHeight = cRect ? cRect.top - rect.top : headerHeight;
            updateHeaderSnapshot(container, hHeight, rect.width);
          }
        }, 1000);
      } catch (error) {
        console.error('Failed to start recording:', error);
      }
    }, [
      recordedVideoUrl,
      containerRef,
      pages,
      activePageIndex,
      isExcelMode,
      waitForCaptureableElement,
      updateHeaderSnapshot,
      captureExcelContentOnce,
    ]);

    // Capture screenshot from the composite canvas
    const captureScreenshot = useCallback((): string | null => {
      if (!compositeCanvasRef.current) {
        console.log('[RECORDING] No composite canvas available for screenshot');
        return null;
      }

      try {
        // Convert the composite canvas to a data URL (JPEG for smaller size)
        const dataUrl = compositeCanvasRef.current.toDataURL('image/jpeg', 0.8);
        console.log('[RECORDING] Screenshot captured');
        return dataUrl;
      } catch (e) {
        console.error('[RECORDING] Failed to capture screenshot:', e);
        return null;
      }
    }, []);

    const captureCurrentFrame = useCallback(async (): Promise<string | null> => {
      try {
        const activePage = activePageRef.current;
        if (!activePage || activePage.isSkeleton) return null;

        if (isExcelModeRef.current) {
          const contentArea = containerRef.current?.querySelector('.browser-content-area');
          if (!contentArea) return null;
          const excelCanvas = await html2canvas(contentArea as HTMLElement, {
            useCORS: true,
            allowTaint: true,
            logging: false,
            scale: window.devicePixelRatio,
          });
          return excelCanvas.toDataURL('image/jpeg', 0.85);
        }

        const iframe = browserContentRef.current?.getIframeForPage(activePage.id);
        if (!iframe) return null;

        const iframeDocument = iframe.contentWindow?.document;
        if (!iframeDocument) return null;

        const sourceElement = findCaptureableElement(iframeDocument, 0, false);
        if (!sourceElement) return null;

        const sourceWidth =
          sourceElement instanceof HTMLCanvasElement
            ? sourceElement.width
            : sourceElement.videoWidth || sourceElement.width;
        const sourceHeight =
          sourceElement instanceof HTMLCanvasElement
            ? sourceElement.height
            : sourceElement.videoHeight || sourceElement.height;

        if (!sourceWidth || !sourceHeight) return null;

        const snapshotCanvas = document.createElement('canvas');
        snapshotCanvas.width = Math.max(1, Math.floor(sourceWidth));
        snapshotCanvas.height = Math.max(1, Math.floor(sourceHeight));

        const ctx = snapshotCanvas.getContext('2d', { alpha: false });
        if (!ctx) return null;

        ctx.drawImage(
          sourceElement,
          0,
          0,
          sourceWidth,
          sourceHeight,
          0,
          0,
          snapshotCanvas.width,
          snapshotCanvas.height,
        );

        return snapshotCanvas.toDataURL('image/jpeg', 0.9);
      } catch (error) {
        return null;
      }
    }, [containerRef, findCaptureableElement]);

    const stopRecording = useCallback((): Promise<string | null> => {
      return new Promise((resolve) => {
        if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') {
          if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
          }
          if (html2canvasIntervalRef.current) {
            clearInterval(html2canvasIntervalRef.current);
            html2canvasIntervalRef.current = null;
          }
          if (headerUpdateIntervalRef.current) {
            clearInterval(headerUpdateIntervalRef.current);
            headerUpdateIntervalRef.current = null;
          }
          if (excelCaptureIntervalRef.current) {
            clearInterval(excelCaptureIntervalRef.current);
            excelCaptureIntervalRef.current = null;
          }
          setIsRecording(false);
          resolve(recordedVideoUrl);
          return;
        }

        stopResolveRef.current = resolve;
        // Request any buffered data before stopping to avoid losing the last ~1 second
        if (mediaRecorderRef.current.state === 'recording') {
          mediaRecorderRef.current.requestData();
        }
        mediaRecorderRef.current.stop();
        setIsRecording(false);
      });
    }, [recordedVideoUrl]);

    // Cleanup on unmount
    useEffect(() => {
      return () => {
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
        }
        if (html2canvasIntervalRef.current) {
          clearInterval(html2canvasIntervalRef.current);
        }
        if (headerUpdateIntervalRef.current) {
          clearInterval(headerUpdateIntervalRef.current);
        }
        if (excelCaptureIntervalRef.current) {
          clearInterval(excelCaptureIntervalRef.current);
        }
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop());
        }
      };
    }, []);

    // Expose methods via ref
    useImperativeHandle(
      ref,
      () => ({
        stopRecording,
        getRecordedVideoUrl: () => recordedVideoUrl,
        captureScreenshot,
        captureCurrentFrame,
      }),
      [stopRecording, recordedVideoUrl, captureScreenshot, captureCurrentFrame],
    );

    // Handle auto-start recording
    useEffect(() => {
      if (autoRecord && !hasAutoStarted && !isRecording && sessionId) {
        console.log('[RECORDING] autoRecord enabled, auto-starting recording...');
        setHasAutoStarted(true);
        setTimeout(() => {
          startRecording();
        }, 500);
      } else if (!autoRecord && hasAutoStarted) {
        console.log('[RECORDING] autoRecord disabled, resetting hasAutoStarted');
        setHasAutoStarted(false);
      }
    }, [autoRecord, hasAutoStarted, isRecording, sessionId, startRecording]);

    // Update source element when tab changes during recording
    useEffect(() => {
      if (!isRecording) return;

      const updateSourceOnTabSwitch = async () => {
        const container = containerRef?.current;
        if (!container) return;

        const containerRect = container.getBoundingClientRect();
        const contentArea = container.querySelector('.browser-content-area');
        const contentRect = contentArea?.getBoundingClientRect();
        const headerHeight = contentRect ? contentRect.top - containerRect.top : 80;

        await updateHeaderSnapshot(container, headerHeight, containerRect.width);

        if (isExcelMode) {
          console.log('[RECORDING] Switched to Excel mode');
          currentSourceElementRef.current = null;
          return;
        }

        const activePage = pages[activePageIndex];
        if (!activePage) return;

        if (activePage.isSkeleton) {
          console.log(`[RECORDING] Tab ${activePageIndex} is skeleton, clearing source element`);
          currentSourceElementRef.current = null;
          return;
        }

        const iframe = browserContentRef.current?.getIframeForPage(activePage.id);
        if (!iframe) return;

        console.log(`[RECORDING] Tab switched to ${activePageIndex}, updating source element...`);
        const newSource = await waitForCaptureableElement(iframe);
        currentSourceElementRef.current = newSource;
      };

      updateSourceOnTabSwitch();
    }, [
      activePageIndex,
      isRecording,
      pages,
      isExcelMode,
      containerRef,
      updateHeaderSnapshot,
      waitForCaptureableElement,
    ]);

    // Capture Excel content periodically when in Excel mode during recording
    useEffect(() => {
      if (!isRecording || !isExcelMode) {
        // Clear interval when not recording or not in Excel mode
        if (excelCaptureIntervalRef.current) {
          clearInterval(excelCaptureIntervalRef.current);
          excelCaptureIntervalRef.current = null;
        }
        excelContentCanvasRef.current = null;
        return;
      }

      const container = containerRef?.current;
      if (!container) return;

      const contentArea = container.querySelector('.browser-content-area');
      if (!contentArea) return;

      let isCapturing = false;

      const captureExcelContent = async () => {
        // Prevent overlapping captures
        if (isCapturing) return;
        isCapturing = true;
        try {
          await captureExcelContentOnce(contentArea);
        } finally {
          isCapturing = false;
        }
      };

      // Capture immediately
      captureExcelContent();

      // Set up interval to capture at ~10fps
      excelCaptureIntervalRef.current = setInterval(captureExcelContent, 100);

      return () => {
        if (excelCaptureIntervalRef.current) {
          clearInterval(excelCaptureIntervalRef.current);
          excelCaptureIntervalRef.current = null;
        }
      };
    }, [isRecording, isExcelMode, containerRef, captureExcelContentOnce]);

    // Update source when skeleton finishes loading
    useEffect(() => {
      if (!isRecording || isExcelMode) return;

      const activePage = pages[activePageIndex];
      if (!activePage || activePage.isSkeleton) return;
      if (currentSourceElementRef.current) return;

      const updateSourceAfterSkeletonLoaded = async () => {
        const iframe = browserContentRef.current?.getIframeForPage(activePage.id);
        if (!iframe) {
          setTimeout(updateSourceAfterSkeletonLoaded, 100);
          return;
        }

        console.log(`[RECORDING] Skeleton finished loading, finding source element...`);
        const newSource = await waitForCaptureableElement(iframe);
        currentSourceElementRef.current = newSource;

        const container = containerRef?.current;
        if (container) {
          const containerRect = container.getBoundingClientRect();
          const contentArea = container.querySelector('.browser-content-area');
          const contentRect = contentArea?.getBoundingClientRect();
          const headerHeight = contentRect ? contentRect.top - containerRect.top : 80;
          await updateHeaderSnapshot(container, headerHeight, containerRect.width);
        }
      };

      updateSourceAfterSkeletonLoaded();
    }, [
      pages,
      activePageIndex,
      isRecording,
      isExcelMode,
      containerRef,
      updateHeaderSnapshot,
      waitForCaptureableElement,
    ]);

    // Keep a recent content frame so freeze can be immediate when execution ends.
    useEffect(() => {
      if (!readOnly || freeze) return;

      let cancelled = false;

      const capture = async () => {
        if (cancelled || frameCaptureInFlightRef.current) return;
        frameCaptureInFlightRef.current = true;
        try {
          const frame = await captureCurrentFrame();
          if (!cancelled && frame) {
            lastContentFrameRef.current = frame;
          }
        } finally {
          frameCaptureInFlightRef.current = false;
        }
      };

      void capture();
      const interval = setInterval(() => {
        void capture();
      }, 500);

      return () => {
        cancelled = true;
        clearInterval(interval);
      };
    }, [readOnly, freeze, captureCurrentFrame]);

    useEffect(() => {
      if (!freeze) {
        setFrozenContentFrame(null);
        return;
      }

      let cancelled = false;

      if (lastContentFrameRef.current) {
        setFrozenContentFrame(lastContentFrameRef.current);
      }

      const captureForFreeze = async () => {
        if (frameCaptureInFlightRef.current) return;
        frameCaptureInFlightRef.current = true;
        try {
          const frame = await captureCurrentFrame();
          if (!cancelled && frame) {
            lastContentFrameRef.current = frame;
            setFrozenContentFrame(frame);
          }
        } finally {
          frameCaptureInFlightRef.current = false;
        }
      };

      void captureForFreeze();

      return () => {
        cancelled = true;
      };
    }, [freeze, captureCurrentFrame]);

    return (
      <Box
        as="main"
        height="full"
        display="flex"
        alignItems="stretch"
        justifyContent="center"
        overflow="hidden"
      >
        <Box
          ref={containerRef}
          onFocusCapture={handleFocus}
          height="full"
          width="full"
          alignSelf="stretch"
          borderRadius="md"
          position="relative"
          overflow="hidden"
          display="flex"
          flexDirection="column"
          shadow="2xl"
          scrollMarginTop="24"
          bg="white"
        >
          {(!sessionId || readOnly) && (
            <BrowserOverlay
              isLoading={isLoading}
              onClick={onOverlayClick}
              minimal={minimalOverlay}
            />
          )}

          <BrowserTabs
            pages={pages}
            activePageIndex={activePageIndex}
            setActivePageIndex={handleSelectTab}
            handleAddTab={handleAddTab}
            handleCloseTab={handleCloseTab}
            refreshPages={refreshPages}
            sessionId={sessionId}
            isAddingTab={isAddingTab}
            onExcelOpen={handleOpenExcel}
            isExcelMode={isExcelMode}
            readOnly={readOnly}
          />

          {!isExcelMode && (
            <BrowserToolbar
              pages={pages}
              activePageIndex={activePageIndex}
              sessionId={sessionId}
              refreshPages={refreshPages}
              onNavigate={onNavigate}
              onGoBack={onGoBack}
              onGoForward={onGoForward}
              onReload={onReload}
              focusUrlBar={focusUrlBar}
              readOnly={readOnly}
            />
          )}

          <BrowserContent
            ref={browserContentRef}
            key={`browser-content-${recordingKey ?? 'default'}`}
            pages={pages}
            activePageIndex={activePageIndex}
            contentRef={contentRef}
            emptyState={emptyState}
            showLoadSkeleton={showLoadSkeleton}
            sessionId={sessionId}
            isExcelMode={isExcelMode}
            readOnly={readOnly}
            freeze={freeze}
            frozenFrame={frozenContentFrame}
            inspectorUrlTemplate={inspectorUrlTemplate}
          />
        </Box>
      </Box>
    );
  },
);

BrowserContainer.displayName = 'BrowserContainer';
