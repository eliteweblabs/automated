'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type Protocol from 'devtools-protocol';

type CDPMethod = string;
type CDPParams = Record<string, unknown>;
type CDPResult = Record<string, unknown>;

interface CDPMessage {
  id: number;
  method?: CDPMethod;
  params?: CDPParams;
  result?: CDPResult;
  error?: { code: number; message: string };
}

interface PendingRequest {
  resolve: (result: CDPResult) => void;
  reject: (error: Error) => void;
}

interface BrowserCDPState {
  isConnected: boolean;
  error: string | null;
}

export interface Interaction {
  id: string;
  type: 'user_event' | 'tab_navigation' | 'frame_navigation';
  timestamp: number;
  pageId: string;
  screenshotUrl?: string;
  transcript?: string;
  element: {
    tagName?: string;
    text?: string;
    selector?: string;
    href?: string;
    [key: string]: any;
  };
  data?: any;
}

export interface InteractionCallbacks {
  onInteraction?: (interaction: Interaction) => void;
  captureScreenshot?: () => string | null;
  onFrameNavigation?: (url: string, frameId: string, pageId: string) => void;
  onTitleUpdate?: (title: string, pageId: string) => void;
  onFaviconUpdate?: (faviconUrl: string, pageId: string) => void;
  onNewTabDetected?: (targetId: string, url: string) => void;
  onWebSocketDisconnected?: () => void;
}

interface UseBrowserCDPReturn extends BrowserCDPState {
  // Tab management
  createTarget: (url?: string) => Promise<Protocol.Target.CreateTargetResponse>;
  closeTarget: (targetId: string) => Promise<Protocol.Target.CloseTargetResponse>;
  getTargets: () => Promise<Protocol.Target.GetTargetsResponse>;
  activateTarget: (targetId: string) => Promise<void>;

  // Navigation
  navigate: (targetId: string, url: string) => Promise<Protocol.Page.NavigateResponse>;
  goBack: (targetId: string) => Promise<void>;
  goForward: (targetId: string) => Promise<void>;
  reload: (targetId: string) => Promise<void>;

  // DOM interaction
  focusElement: (targetId: string, selector: string, maxAttempts?: number) => Promise<boolean>;

  // Generic CDP commands
  send: <T = CDPResult>(method: CDPMethod, params?: CDPParams) => Promise<T>;
  sendToPage: <T = CDPResult>(targetId: string, method: CDPMethod, params?: CDPParams) => Promise<T>;

  // Connection management
  connect: (pageId: string) => void;
  connectToPage: (pageId: string) => void;
  ensurePageConnections: (pageIds: string[]) => void;
  disconnect: () => void;

  // Interactions
  interactions: Interaction[];
  clearInteractions: () => void;
  removeInteraction: (id: string) => void;
  addInteraction: (
    type: Interaction['type'],
    element: Interaction['element'],
    pageId?: string,
    data?: any,
  ) => void;
}

/**
 * Hook for sending CDP commands to control the browser.
 *
 * Target domain commands (createTarget, closeTarget, etc.) are browser-level
 * but can be sent through any page's WebSocket connection - CDP routes them
 * to the browser automatically.
 */
// Default to Browserbase URL pattern if no template provided
const DEFAULT_CDP_WS_TEMPLATE = (sessionId: string) =>
  `wss://connect.browserbase.com/debug/${sessionId}/devtools/page/{pageId}`;

export function useBrowserCDP(
  sessionId: string | null,
  initialPageId?: string,
  callbacks?: InteractionCallbacks,
  cdpWsUrlTemplate?: string | null,
): UseBrowserCDPReturn {
  const [state, setState] = useState<BrowserCDPState>({
    isConnected: false,
    error: null,
  });

  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const callbacksRef = useRef(callbacks);

  // Keep callbacks ref updated
  useEffect(() => {
    callbacksRef.current = callbacks;
  }, [callbacks]);

  // Refs for grouping keypresses
  const typingBufferRef = useRef<{
    interactionId: string;
    text: string;
    lastTimestamp: number;
    selector: string;
  } | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const currentPageIdRef = useRef<string | null>(null);
  const messageIdRef = useRef(1);
  const pendingRequestsRef = useRef<Map<number, PendingRequest>>(new Map());
  const pageSessionsRef = useRef<Map<string, WebSocket>>(new Map());
  const keepAliveIntervalsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const knownPageIdsRef = useRef<Set<string>>(new Set());
  const injectedPagesRef = useRef<Set<string>>(new Set());

  // Throttling refs for interaction events
  const lastNavigationRefreshRef = useRef<number>(0);
  const lastClickTimestampRef = useRef<number>(0);
  const lastKeydownRef = useRef<{ key: string; timestamp: number } | null>(null);

  // Handler refs (set later, used in connectToPage)
  const addInteractionRef = useRef<
    | ((
        type: Interaction['type'],
        element: Interaction['element'],
        pageId?: string,
        data?: any,
      ) => void)
    | null
  >(null);
  const handleKeydownRef = useRef<((eventData: any, pageId?: string) => void) | null>(null);

  const setupKeepAlive = useCallback((pageId: string, ws: WebSocket) => {
    const existingInterval = keepAliveIntervalsRef.current.get(pageId);
    if (existingInterval) {
      clearInterval(existingInterval);
    }

    const interval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        const id = messageIdRef.current++;
        ws.send(
          JSON.stringify({
            id,
            method: 'Runtime.evaluate',
            params: { expression: '1', returnByValue: true },
          }),
        );
        console.log(`[CDP] Keep-alive ping sent for page ${pageId}`);
      }
    }, 2000);

    keepAliveIntervalsRef.current.set(pageId, interval);
  }, []);

  const connectToPage = useCallback(
    (pageId: string) => {
      if (!sessionId) return;

      knownPageIdsRef.current.add(pageId);

      const existingWs = pageSessionsRef.current.get(pageId);
      if (
        existingWs?.readyState === WebSocket.OPEN ||
        existingWs?.readyState === WebSocket.CONNECTING
      ) {
        console.log(`[CDP] WebSocket already open/connecting for page ${pageId}`);
        return;
      }

      const template = cdpWsUrlTemplate || DEFAULT_CDP_WS_TEMPLATE(sessionId);
      const wsUrl = template.replace('{pageId}', pageId);
      console.log(`[CDP] Connecting WebSocket for page ${pageId}:`, wsUrl);

      const ws = new WebSocket(wsUrl);
      pageSessionsRef.current.set(pageId, ws);
      let msgId = 1000;

      ws.onopen = () => {
        console.log(`[CDP] WebSocket connected for page ${pageId}`);
        setupKeepAlive(pageId, ws);

        // Enable Page (for navigation events) and Runtime (required for
        // Runtime.bindingCalled delivery). DOM.enable is omitted — it is
        // not needed for event tracking and adds noise.
        // Note: Runtime.enable on a CDP debugging session is invisible to
        // web-page JavaScript, so it does NOT affect bot detection.
        ws.send(JSON.stringify({ id: msgId++, method: 'Page.enable' }));
        ws.send(JSON.stringify({ id: msgId++, method: 'Runtime.enable' }));
        ws.send(
          JSON.stringify({
            id: msgId++,
            method: 'Runtime.addBinding',
            params: { name: '__cdpEvent' },
          }),
        );
      };

      ws.onclose = (event) => {
        console.log(`[CDP] WebSocket closed for page ${pageId}:`, event.code, event.reason);
        pageSessionsRef.current.delete(pageId);
        injectedPagesRef.current.delete(pageId);
        const interval = keepAliveIntervalsRef.current.get(pageId);
        if (interval) {
          clearInterval(interval);
          keepAliveIntervalsRef.current.delete(pageId);
        }

        // Check if all page connections are lost
        const hasActiveConnections = Array.from(pageSessionsRef.current.values()).some(
          (ws) => ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING
        );

        // If no active connections and this wasn't a clean close, trigger reconnect callback
        if (!hasActiveConnections && event.code !== 1000 && callbacksRef.current?.onWebSocketDisconnected) {
          console.log('[CDP] All WebSocket connections lost, triggering disconnect callback');
          callbacksRef.current.onWebSocketDisconnected();
        }
      };

      ws.onerror = (error) => {
        console.error(`[CDP] WebSocket error for page ${pageId}:`, error);
      };

      ws.onmessage = (event) => {
        try {
          const message: CDPMessage = JSON.parse(event.data);

          // Handle pending CDP command responses
          if (message.id !== undefined) {
            const pending = pendingRequestsRef.current.get(message.id);
            if (pending) {
              pendingRequestsRef.current.delete(message.id);
              if (message.error) {
                pending.reject(new Error(message.error.message));
              } else {
                pending.resolve(message.result || {});
              }
            }
          }

          // Handle interaction events via Runtime.bindingCalled (stealth alternative to Runtime.consoleAPICalled)
          // Note: For local browser, the screencast iframe is the primary source
          // of these events (via postMessage). This path serves as a fallback for
          // Browserbase sessions where there is no screencast iframe.
          if (message.method === 'Runtime.bindingCalled' && (message.params as Record<string, unknown>)?.name === '__cdpEvent') {
            try {
              const eventData = JSON.parse((message.params as Record<string, unknown>)?.payload as string || '{}');
              const now = Date.now();

              if (eventData.type === 'keydown') {
                handleKeydownRef.current?.(eventData, pageId);
              } else if (eventData.type === 'click') {
                // Deduplicate clicks within 100ms to prevent duplicate events
                if (now - lastClickTimestampRef.current < 100) {
                  return;
                }
                lastClickTimestampRef.current = now;
                addInteractionRef.current?.(
                  'user_event',
                  eventData.target || {
                    tagName: 'CLICK',
                    text: 'click',
                    selector: 'unknown',
                  },
                  pageId,
                  eventData,
                );
              }
            } catch (e) {
              console.warn('[CDP] Failed to parse binding event:', e);
            }
          }

          // Handle page load events - re-query title when page finishes loading
          if (message.method === 'Page.loadEventFired' || message.method === 'Page.domContentEventFired') {
            console.log(`[CDP] ${message.method} fired for page ${pageId}, querying title and favicon`);
            if (ws.readyState === WebSocket.OPEN) {
              const titleMsgId = messageIdRef.current++;
              const faviconMsgId = messageIdRef.current++;
              const titleHandler = (event: MessageEvent) => {
                try {
                  const response = JSON.parse(event.data);
                  if (response.id === titleMsgId) {
                    const title = response.result?.result?.value;
                    console.log(`[CDP] Title query result for page ${pageId}:`, title);
                    if (title && callbacksRef.current?.onTitleUpdate) {
                      callbacksRef.current.onTitleUpdate(title, pageId);
                    }
                  }
                  if (response.id === faviconMsgId) {
                    const faviconUrl = response.result?.result?.value;
                    console.log(`[CDP] Favicon query result for page ${pageId}:`, faviconUrl);
                    if (faviconUrl && callbacksRef.current?.onFaviconUpdate) {
                      callbacksRef.current.onFaviconUpdate(faviconUrl, pageId);
                    }
                  }
                } catch (e) {
                  // Ignore parse errors
                }
              };
              ws.addEventListener('message', titleHandler);
              // Remove after 5s to avoid leaks
              setTimeout(() => ws.removeEventListener('message', titleHandler), 5000);
              ws.send(
                JSON.stringify({
                  id: titleMsgId,
                  method: 'Runtime.evaluate',
                  params: { expression: 'document.title', returnByValue: true },
                }),
              );
              ws.send(
                JSON.stringify({
                  id: faviconMsgId,
                  method: 'Runtime.evaluate',
                  params: {
                    expression: `(function() { var link = document.querySelector('link[rel~="icon"]'); return link ? link.href : (location.origin + '/favicon.ico'); })()`,
                    returnByValue: true,
                  },
                }),
              );
            }
          }

          // Handle frame navigation events
          if (message.method === 'Page.frameNavigated') {
            const frame = (message.params as any)?.frame;
            // Only handle main frame navigations (parentId is undefined for main frame)
            if (frame && !frame.parentId) {
              const now = Date.now();
              if (now - lastNavigationRefreshRef.current > 1000) {
                lastNavigationRefreshRef.current = now;
                addInteractionRef.current?.(
                  'frame_navigation',
                  {
                    tagName: 'FRAME_NAVIGATION',
                    text: `Navigated to ${frame.url}`,
                    selector: frame.id,
                    href: frame.url,
                  },
                  pageId,
                  {
                    url: frame.url,
                    frameId: frame.id,
                    name: frame.name,
                    pageId,
                  },
                );

                // Immediately notify with URL (title will come later)
                if (callbacksRef.current?.onFrameNavigation) {
                  callbacksRef.current.onFrameNavigation(frame.url, frame.id, pageId);
                }

                // Query title and favicon after a short delay to let the page load
                setTimeout(() => {
                  console.log(`[CDP] 500ms fast-path: querying title and favicon for page ${pageId}`);
                  if (ws.readyState === WebSocket.OPEN) {
                    const titleMsgId = messageIdRef.current++;
                    const faviconMsgId = messageIdRef.current++;
                    const handler = (event: MessageEvent) => {
                      try {
                        const response = JSON.parse(event.data);
                        if (response.id === titleMsgId) {
                          const title = response.result?.result?.value;
                          console.log(`[CDP] 500ms title result for page ${pageId}:`, title);
                          if (title && callbacksRef.current?.onTitleUpdate) {
                            callbacksRef.current.onTitleUpdate(title, pageId);
                          }
                        }
                        if (response.id === faviconMsgId) {
                          const faviconUrl = response.result?.result?.value;
                          console.log(`[CDP] 500ms favicon result for page ${pageId}:`, faviconUrl);
                          if (faviconUrl && callbacksRef.current?.onFaviconUpdate) {
                            callbacksRef.current.onFaviconUpdate(faviconUrl, pageId);
                          }
                        }
                      } catch (e) {
                        // Ignore parse errors
                      }
                    };
                    ws.addEventListener('message', handler);
                    setTimeout(() => ws.removeEventListener('message', handler), 5000);
                    ws.send(
                      JSON.stringify({
                        id: titleMsgId,
                        method: 'Runtime.evaluate',
                        params: { expression: 'document.title', returnByValue: true },
                      }),
                    );
                    ws.send(
                      JSON.stringify({
                        id: faviconMsgId,
                        method: 'Runtime.evaluate',
                        params: {
                          expression: `(function() { var link = document.querySelector('link[rel~="icon"]'); return link ? link.href : (location.origin + '/favicon.ico'); })()`,
                          returnByValue: true,
                        },
                      }),
                    );
                  }
                }, 500);
              }
            }
          }
        } catch (e) {
          console.warn('[CDP] Failed to parse message:', e);
        }
      };
    },
    [sessionId, setupKeepAlive, cdpWsUrlTemplate],
  );

  const ensurePageConnections = useCallback(
    (pageIds: string[]) => {
      if (!sessionId) return;

      console.log('[CDP] Ensuring connections for pages:', pageIds);

      pageIds.forEach((pageId) => {
        knownPageIdsRef.current.add(pageId);
        const existingWs = pageSessionsRef.current.get(pageId);
        const isConnected =
          existingWs?.readyState === WebSocket.OPEN ||
          existingWs?.readyState === WebSocket.CONNECTING;
        if (!isConnected) {
          connectToPage(pageId);
        }
      });

      const removedPages = Array.from(knownPageIdsRef.current).filter(
        (id) => !pageIds.includes(id),
      );
      removedPages.forEach((pageId) => {
        knownPageIdsRef.current.delete(pageId);
        const ws = pageSessionsRef.current.get(pageId);
        if (ws) {
          ws.close();
          pageSessionsRef.current.delete(pageId);
        }
        const interval = keepAliveIntervalsRef.current.get(pageId);
        if (interval) {
          clearInterval(interval);
          keepAliveIntervalsRef.current.delete(pageId);
        }
      });
    },
    [sessionId, connectToPage],
  );

  const connect = useCallback(
    (pageId: string) => {
      if (!sessionId) return;

      if (wsRef.current?.readyState === WebSocket.OPEN && currentPageIdRef.current === pageId) {
        return;
      }

      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }

      currentPageIdRef.current = pageId;

      const template = cdpWsUrlTemplate || DEFAULT_CDP_WS_TEMPLATE(sessionId);
      const wsUrl = template.replace('{pageId}', pageId);
      console.log('[CDP] Connecting to page WebSocket for browser commands:', wsUrl);

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[CDP] Page WebSocket connected (for browser commands)');
        setState({ isConnected: true, error: null });

        // Enable target discovery to detect new tabs (e.g. target="_blank" links)
        const discoverMsgId = messageIdRef.current++;
        ws.send(
          JSON.stringify({
            id: discoverMsgId,
            method: 'Target.setDiscoverTargets',
            params: { discover: true },
          }),
        );
      };

      ws.onclose = (event) => {
        console.log('[CDP] Page WebSocket closed:', event.code, event.reason);
        if (currentPageIdRef.current === pageId) {
          setState({ isConnected: false, error: null });
          wsRef.current = null;
          currentPageIdRef.current = null;

          // If this wasn't a clean close, trigger disconnect callback
          if (event.code !== 1000 && callbacksRef.current?.onWebSocketDisconnected) {
            console.log('[CDP] Main WebSocket connection lost, triggering disconnect callback');
            callbacksRef.current.onWebSocketDisconnected();
          }
        }
      };

      ws.onerror = (error) => {
        console.error('[CDP] Page WebSocket error:', error);
        setState({ isConnected: false, error: 'WebSocket connection error' });
      };

      ws.onmessage = (event) => {
        try {
          const message: CDPMessage = JSON.parse(event.data);

          if (message.id !== undefined) {
            const pending = pendingRequestsRef.current.get(message.id);
            if (pending) {
              pendingRequestsRef.current.delete(message.id);
              if (message.error) {
                pending.reject(new Error(message.error.message));
              } else {
                pending.resolve(message.result || {});
              }
            }
          }

          // Detect new tabs opened via target="_blank" or window.open
          if (message.method === 'Target.targetCreated') {
            const targetInfo = (message.params as any)?.targetInfo;
            if (targetInfo?.type === 'page' && !knownPageIdsRef.current.has(targetInfo.targetId)) {
              console.log('[CDP] New tab detected:', targetInfo.targetId, targetInfo.url);
              if (callbacksRef.current?.onNewTabDetected) {
                callbacksRef.current.onNewTabDetected(targetInfo.targetId, targetInfo.url || 'about:blank');
              }
            }
          }
        } catch (e) {
          console.warn('[CDP] Failed to parse message:', e);
        }
      };

      // Note: connectToPage is called separately via ensurePageConnections
      // to avoid duplicate connections
    },
    [sessionId, cdpWsUrlTemplate],
  );

  const disconnect = useCallback(() => {
    keepAliveIntervalsRef.current.forEach((interval) => clearInterval(interval));
    keepAliveIntervalsRef.current.clear();

    pageSessionsRef.current.forEach((ws) => ws.close());
    pageSessionsRef.current.clear();

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    currentPageIdRef.current = null;
    setState({ isConnected: false, error: null });
  }, []);

  useEffect(() => {
    if (sessionId && initialPageId) {
      connect(initialPageId);
    } else if (!sessionId) {
      disconnect();
    }

    return () => disconnect();
  }, [sessionId, initialPageId, connect, disconnect]);

  useEffect(() => {
    if (!sessionId) return;

    const knownPages = Array.from(knownPageIdsRef.current);
    if (knownPages.length > 0) {
      console.log('[CDP] Reconnecting to known pages:', knownPages);
      knownPages.forEach((pageId) => {
        const existingWs = pageSessionsRef.current.get(pageId);
        if (!existingWs || existingWs.readyState !== WebSocket.OPEN) {
          connectToPage(pageId);
        }
      });
    }
  }, [sessionId, connectToPage]);

  useEffect(() => {
    if (!sessionId || !state.isConnected) return;

    const keepAliveInterval = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        const id = messageIdRef.current++;
        wsRef.current.send(
          JSON.stringify({
            id,
            method: 'Runtime.evaluate',
            params: { expression: '1', returnByValue: true },
          }),
        );
        console.log('[CDP] Keep-alive ping sent (main connection)');
      }
    }, 3000);

    return () => clearInterval(keepAliveInterval);
  }, [sessionId, state.isConnected]);

  const send = useCallback(<T = CDPResult>(method: CDPMethod, params?: CDPParams): Promise<T> => {
    return new Promise((resolve, reject) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket not connected'));
        return;
      }

      const id = messageIdRef.current++;
      const message: CDPMessage = { id, method, params };

      pendingRequestsRef.current.set(id, {
        resolve: resolve as (result: CDPResult) => void,
        reject,
      });

      // Timeout after 30 seconds
      setTimeout(() => {
        if (pendingRequestsRef.current.has(id)) {
          pendingRequestsRef.current.delete(id);
          reject(new Error(`CDP command timeout: ${method}`));
        }
      }, 30000);

      wsRef.current.send(JSON.stringify(message));
    });
  }, []);

  const sendToPage = useCallback(
    async <T = CDPResult>(targetId: string, method: CDPMethod, params?: CDPParams): Promise<T> => {
      return new Promise((resolve, reject) => {
        if (!sessionId) {
          reject(new Error('No session ID'));
          return;
        }

        let pageWs = pageSessionsRef.current.get(targetId);

        const executeCommand = () => {
          const id = messageIdRef.current++;
          const message: CDPMessage = { id, method, params };

          const handleMessage = (event: MessageEvent) => {
            try {
              const response: CDPMessage = JSON.parse(event.data);
              if (response.id === id) {
                pageWs?.removeEventListener('message', handleMessage);
                if (response.error) {
                  reject(new Error(response.error.message));
                } else {
                  resolve((response.result || {}) as T);
                }
              }
            } catch (e) {
              // Ignore parse errors for other messages
            }
          };

          pageWs?.addEventListener('message', handleMessage);
          pageWs?.send(JSON.stringify(message));

          setTimeout(() => {
            pageWs?.removeEventListener('message', handleMessage);
            reject(new Error(`Page CDP command timeout: ${method}`));
          }, 30000);
        };

        if (!pageWs || pageWs.readyState !== WebSocket.OPEN) {
          connectToPage(targetId);
          pageWs = pageSessionsRef.current.get(targetId);

          if (pageWs) {
            pageWs.addEventListener(
              'open',
              () => {
                executeCommand();
              },
              { once: true },
            );

            pageWs.addEventListener(
              'error',
              () => {
                reject(new Error('Failed to connect to page target'));
              },
              { once: true },
            );
          } else {
            reject(new Error('Failed to create WebSocket for page'));
          }
        } else {
          executeCommand();
        }
      });
    },
    [sessionId, connectToPage],
  );

  // Tab management methods
  const createTarget = useCallback(
    async (url = 'about:blank'): Promise<Protocol.Target.CreateTargetResponse> => {
      const result = await send<Protocol.Target.CreateTargetResponse>('Target.createTarget', { url });
      // Register immediately so Target.targetCreated event doesn't trigger onNewTabDetected
      if (result.targetId) {
        knownPageIdsRef.current.add(result.targetId);
      }
      return result;
    },
    [send],
  );

  const closeTarget = useCallback(
    async (targetId: string): Promise<Protocol.Target.CloseTargetResponse> => {
      knownPageIdsRef.current.delete(targetId);

      const interval = keepAliveIntervalsRef.current.get(targetId);
      if (interval) {
        clearInterval(interval);
        keepAliveIntervalsRef.current.delete(targetId);
      }

      const pageWs = pageSessionsRef.current.get(targetId);
      if (pageWs) {
        pageWs.close();
        pageSessionsRef.current.delete(targetId);
      }
      return send<Protocol.Target.CloseTargetResponse>('Target.closeTarget', { targetId });
    },
    [send],
  );

  const getTargets = useCallback(async (): Promise<Protocol.Target.GetTargetsResponse> => {
    return send<Protocol.Target.GetTargetsResponse>('Target.getTargets');
  }, [send]);

  const activateTarget = useCallback(
    async (targetId: string): Promise<void> => {
      await send('Target.activateTarget', { targetId });
    },
    [send],
  );

  // Navigation
  const navigate = useCallback(
    async (targetId: string, url: string): Promise<Protocol.Page.NavigateResponse> => {
      // First enable the Page domain on this target
      await sendToPage(targetId, 'Page.enable');
      return sendToPage<Protocol.Page.NavigateResponse>(targetId, 'Page.navigate', { url });
    },
    [sendToPage],
  );

  const goBack = useCallback(
    async (targetId: string): Promise<void> => {
      await sendToPage(targetId, 'Runtime.evaluate', {
        expression: 'history.back()',
      });
    },
    [sendToPage],
  );

  const goForward = useCallback(
    async (targetId: string): Promise<void> => {
      await sendToPage(targetId, 'Runtime.evaluate', {
        expression: 'history.forward()',
      });
    },
    [sendToPage],
  );

  const reload = useCallback(
    async (targetId: string): Promise<void> => {
      await sendToPage(targetId, 'Page.enable');
      await sendToPage(targetId, 'Page.reload');
    },
    [sendToPage],
  );

  // DOM interaction - retries until element is found or max attempts reached
  const focusElement = useCallback(
    async (targetId: string, selector: string, maxAttempts = 10): Promise<boolean> => {

      const escapedSelector = selector.replace(/'/g, "\\'");

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
          const result = await sendToPage<{ result?: { value?: boolean } }>(
            targetId,
            'Runtime.evaluate',
            {
              expression: `
            (function() {
              const el = document.querySelector('${escapedSelector}');
              if (el) {
                el.focus();
                el.click();
                return true;
              }
              return false;
            })()
          `,
              returnByValue: true,
            },
          );

          if (result?.result?.value === true) {
            console.log('[CDP] Successfully focused element:', selector);
            return true;
          }
        } catch (e) {
          console.warn('[CDP] Focus attempt failed:', e);
        }

        // Wait before retrying
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      console.warn('[CDP] Could not focus element after', maxAttempts, 'attempts:', selector);
      return false;
    },
    [sendToPage],
  );

  // Interaction handling
  const clearInteractions = useCallback(() => {
    setInteractions([]);
    typingBufferRef.current = null;
  }, []);

  const removeInteraction = useCallback((id: string) => {
    setInteractions((prev) => prev.filter((i) => i.id !== id));
  }, []);

  // Helper function to crop screenshot around click point (20% of original size)
  const cropScreenshotAroundClick = useCallback(
    (screenshotUrl: string, clickX: number, clickY: number): Promise<string> => {
      return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';

        img.onload = () => {
          const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 2;

          // Calculate crop dimensions: 20% of original
          const cropWidth = img.width * 0.2;
          const cropHeight = img.height * 0.2;

          // Calculate click position in image coordinates
          const HEADER_HEIGHT_CSS = 80;
          const imgClickX = clickX * dpr;
          const imgClickY = (clickY + HEADER_HEIGHT_CSS) * dpr;

          // Center the crop around the click
          let sourceX = imgClickX - cropWidth / 2;
          let sourceY = imgClickY - cropHeight / 2;

          // Clamp to image bounds
          sourceX = Math.max(0, Math.min(sourceX, img.width - cropWidth));
          sourceY = Math.max(0, Math.min(sourceY, img.height - cropHeight));

          // Create canvas for cropped image
          const canvas = document.createElement('canvas');
          canvas.width = cropWidth;
          canvas.height = cropHeight;
          const ctx = canvas.getContext('2d');

          if (!ctx) {
            resolve(screenshotUrl); // Fallback to original
            return;
          }

          ctx.drawImage(img, sourceX, sourceY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);

          // Draw blue dot at the center (where the click occurred)
          const dotRadius = 10;
          const dotX = cropWidth / 2;
          const dotY = cropHeight / 2;

          ctx.beginPath();
          ctx.arc(dotX, dotY, dotRadius, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(59, 130, 246, 0.9)';
          ctx.fill();

          resolve(canvas.toDataURL('image/png'));
        };

        img.onerror = () => {
          resolve(screenshotUrl); // Fallback to original on error
        };

        img.src = screenshotUrl;
      });
    },
    [],
  );

  const addInteraction = useCallback(
    (type: Interaction['type'], element: Interaction['element'], pageId?: string, data?: any) => {
      typingBufferRef.current = null;

      const interactionId = `${type}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      const interaction: Interaction = {
        id: interactionId,
        type,
        timestamp: Date.now(),
        pageId: pageId ?? '',
        element,
        data,
      };

      console.log('[CDP] Adding interaction:', {
        type,
        pageId,
        eventType: data?.type,
        element: element?.tagName,
      });
      setInteractions((prev) => [...prev, interaction]);

      // Capture and crop screenshot for click events asynchronously
      if (
        type === 'user_event' &&
        data?.type === 'click' &&
        callbacksRef.current?.captureScreenshot
      ) {
        const fullScreenshotUrl = callbacksRef.current.captureScreenshot();
        if (fullScreenshotUrl) {
          cropScreenshotAroundClick(fullScreenshotUrl, data.x || 0, data.y || 0).then(
            (croppedUrl) => {
              setInteractions((prev) =>
                prev.map((i) => (i.id === interactionId ? { ...i, screenshotUrl: croppedUrl } : i)),
              );
            },
          );
        }
      }

      if (callbacksRef.current?.onInteraction) {
        callbacksRef.current.onInteraction(interaction);
      }
    },
    [cropScreenshotAroundClick],
  );

  // Update ref so connectToPage can use it
  addInteractionRef.current = addInteraction;

  const handleKeydown = useCallback((eventData: any, pageId?: string) => {
    const { key, target, ctrlKey, altKey, metaKey } = eventData;

    if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(key)) return;

    const now = Date.now();

    // Deduplicate keydown events within 50ms with same key
    if (
      lastKeydownRef.current &&
      lastKeydownRef.current.key === key &&
      now - lastKeydownRef.current.timestamp < 50
    ) {
      console.log(`[CDP] Ignoring duplicate keydown event for key: ${key}`);
      return;
    }
    lastKeydownRef.current = { key, timestamp: now };

    const selector = target?.selector || 'unknown';

    // Handle modifier key combinations (Ctrl+C, Cmd+V, etc.) as separate "pressed" interactions
    if (ctrlKey || altKey || metaKey) {
      const modifiers: string[] = [];
      if (ctrlKey) modifiers.push('Ctrl');
      if (altKey) modifiers.push('Alt');
      if (metaKey) modifiers.push('Cmd');
      modifiers.push(key.length === 1 ? key.toUpperCase() : key);
      const combo = modifiers.join('+');

      // Clear typing buffer since this is a command, not typing
      typingBufferRef.current = null;

      const interactionId = `keypress-${now}-${Math.random().toString(36).substring(2, 9)}`;
      const newInteraction: Interaction = {
        id: interactionId,
        type: 'user_event',
        timestamp: now,
        pageId: pageId ?? '',
        element: {
          ...target,
          tagName: 'KEYPRESS',
          text: combo,
        },
        data: { ...eventData, type: 'keypress', combo },
      };

      setInteractions((prev) => [...prev, newInteraction]);
      return;
    }

    // Handle Backspace - remove last character from buffer
    if (key === 'Backspace') {
      if (
        typingBufferRef.current &&
        typingBufferRef.current.selector === selector &&
        now - typingBufferRef.current.lastTimestamp < 3000 &&
        typingBufferRef.current.text.length > 0
      ) {
        const interactionId = typingBufferRef.current.interactionId;
        // Remove last character (handle special keys like [Enter] too)
        let currentText = typingBufferRef.current.text;
        if (currentText.endsWith(']')) {
          // Remove entire bracketed key like [Enter]
          const bracketStart = currentText.lastIndexOf('[');
          if (bracketStart !== -1) {
            currentText = currentText.substring(0, bracketStart);
          } else {
            currentText = currentText.slice(0, -1);
          }
        } else {
          currentText = currentText.slice(0, -1);
        }

        typingBufferRef.current = {
          ...typingBufferRef.current,
          text: currentText,
          lastTimestamp: now,
        };

        setInteractions((prev) => {
          const index = prev.findIndex((i) => i.id === interactionId);
          if (index === -1) return prev;
          const updated = [...prev];
          updated[index] = {
            ...updated[index],
            timestamp: now,
            element: {
              ...updated[index].element,
              text: currentText,
            },
          };
          return updated;
        });
      }
      return;
    }

    // Regular character or special key (Enter, Tab, etc.)
    const char = key.length === 1 ? key : `[${key}]`;

    if (
      typingBufferRef.current &&
      typingBufferRef.current.selector === selector &&
      now - typingBufferRef.current.lastTimestamp < 3000
    ) {
      const newText = typingBufferRef.current.text + char;
      const interactionId = typingBufferRef.current.interactionId;

      typingBufferRef.current = {
        ...typingBufferRef.current,
        text: newText,
        lastTimestamp: now,
      };

      setInteractions((prev) => {
        const index = prev.findIndex((i) => i.id === interactionId);
        if (index === -1) return prev;
        const updated = [...prev];
        updated[index] = {
          ...updated[index],
          timestamp: now,
          element: {
            ...updated[index].element,
            text: newText,
          },
        };
        return updated;
      });
    } else {
      const interactionId = `typing-${now}-${Math.random().toString(36).substring(2, 9)}`;
      const newInteraction: Interaction = {
        id: interactionId,
        type: 'user_event',
        timestamp: now,
        pageId: pageId ?? '',
        element: {
          ...target,
          text: char,
        },
        data: { ...eventData, type: 'keydown' },
      };

      typingBufferRef.current = {
        interactionId,
        text: char,
        lastTimestamp: now,
        selector,
      };

      setInteractions((prev) => [...prev, newInteraction]);
    }
  }, []);

  // Update ref so connectToPage can use it
  handleKeydownRef.current = handleKeydown;

  // Listen for postMessage events from the local-screencast iframe.
  // For local browser, the screencast iframe holds the primary CDP
  // connection and forwards Runtime.bindingCalled events (clicks,
  // keydown, scroll) as well as Page.frameNavigated events here.
  useEffect(() => {
    if (!sessionId) return;

    const handleScreencastMessage = (event: MessageEvent) => {
      const msg = event.data;
      if (!msg || typeof msg !== 'object') return;

      if (msg.type === 'screencast:cdp-event' && msg.data) {
        const eventData = msg.data;
        const pageId = msg.pageId || '';
        const now = Date.now();

        if (eventData.type === 'keydown') {
          handleKeydownRef.current?.(eventData, pageId);
        } else if (eventData.type === 'click') {
          if (now - lastClickTimestampRef.current < 100) return;
          lastClickTimestampRef.current = now;
          addInteractionRef.current?.(
            'user_event',
            eventData.target || {
              tagName: 'CLICK',
              text: 'click',
              selector: 'unknown',
            },
            pageId,
            eventData,
          );
        }
      }

      if (msg.type === 'screencast:frame-navigated' && msg.frame) {
        const frame = msg.frame;
        const pageId = msg.pageId || '';
        const now = Date.now();

        if (now - lastNavigationRefreshRef.current > 1000) {
          lastNavigationRefreshRef.current = now;
          addInteractionRef.current?.(
            'frame_navigation',
            {
              tagName: 'FRAME_NAVIGATION',
              text: `Navigated to ${frame.url}`,
              selector: frame.id,
              href: frame.url,
            },
            pageId,
            {
              url: frame.url,
              frameId: frame.id,
              name: frame.name,
              pageId,
            },
          );

          if (callbacksRef.current?.onFrameNavigation) {
            callbacksRef.current.onFrameNavigation(frame.url, frame.id, pageId);
          }
        }
      }

      if (msg.type === 'screencast:page-loaded') {
        const pageId = msg.pageId || '';
        if (callbacksRef.current?.onTitleUpdate || callbacksRef.current?.onFaviconUpdate) {
          // Query title and favicon via the per-page WebSocket (if connected)
          const ws = pageSessionsRef.current.get(pageId);
          if (ws && ws.readyState === WebSocket.OPEN) {
            const titleMsgId = messageIdRef.current++;
            const faviconMsgId = messageIdRef.current++;
            const handler = (evt: MessageEvent) => {
              try {
                const response = JSON.parse(evt.data);
                if (response.id === titleMsgId) {
                  const title = response.result?.result?.value;
                  if (title && callbacksRef.current?.onTitleUpdate) {
                    callbacksRef.current.onTitleUpdate(title, pageId);
                  }
                }
                if (response.id === faviconMsgId) {
                  const faviconUrl = response.result?.result?.value;
                  if (faviconUrl && callbacksRef.current?.onFaviconUpdate) {
                    callbacksRef.current.onFaviconUpdate(faviconUrl, pageId);
                  }
                }
              } catch (e) {
                // Ignore parse errors
              }
            };
            ws.addEventListener('message', handler);
            setTimeout(() => ws.removeEventListener('message', handler), 5000);
            ws.send(
              JSON.stringify({
                id: titleMsgId,
                method: 'Runtime.evaluate',
                params: { expression: 'document.title', returnByValue: true },
              }),
            );
            ws.send(
              JSON.stringify({
                id: faviconMsgId,
                method: 'Runtime.evaluate',
                params: {
                  expression: `(function() { var link = document.querySelector('link[rel~="icon"]'); return link ? link.href : (location.origin + '/favicon.ico'); })()`,
                  returnByValue: true,
                },
              }),
            );
          }
        }
      }
    };

    window.addEventListener('message', handleScreencastMessage);
    return () => window.removeEventListener('message', handleScreencastMessage);
  }, [sessionId]);

  // Clear interactions when session ends
  useEffect(() => {
    if (!sessionId) {
      setInteractions([]);
      typingBufferRef.current = null;
      injectedPagesRef.current.clear();
    }
  }, [sessionId]);

  return {
    ...state,
    createTarget,
    closeTarget,
    getTargets,
    activateTarget,
    navigate,
    goBack,
    goForward,
    reload,
    focusElement,
    send,
    sendToPage,
    connect,
    connectToPage,
    ensurePageConnections,
    disconnect,
    interactions,
    clearInteractions,
    removeInteraction,
    addInteraction,
  };
}
