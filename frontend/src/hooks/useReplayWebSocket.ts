/**
 * WebSocket hook for real-time frame streaming
 * Handles msgpack deserialization, state updates, and reconnection
 */

import { useEffect, useRef, useCallback, useState } from "react";
import { Unpackr } from "msgpackr";
import { useReplayStore } from "../store/replayStore";
import { FrameData } from "../types";

interface WebSocketMessage {
  action: "play" | "pause" | "seek";
  speed?: number;
  frame?: number;
}

const MAX_RECONNECT_ATTEMPTS = 5;
const BASE_RECONNECT_DELAY = 1000;

export const useReplayWebSocket = (sessionId: string | null) => {
  const wsRef = useRef<WebSocket | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intentionalCloseRef = useRef(false);
  const [isConnected, setIsConnected] = useState(false);
  const setCurrentFrame = useReplayStore((state) => state.setCurrentFrame);
  const setLoadingProgress = useReplayStore((state) => state.setLoadingProgress);
  const setLoadingError = useReplayStore((state) => state.setLoadingError);
  const setLoadingComplete = useReplayStore((state) => state.setLoadingComplete);
  const setSession = useReplayStore((state) => state.setSession);
  const playback = useReplayStore((state) => state.playback);
  const lastSentCommandRef = useRef<WebSocketMessage | null>(null);
  const sendCommandRef = useRef<(message: WebSocketMessage) => void>();
  const initialFrameReceivedRef = useRef(false);

  // Create sendCommand function (store in ref to avoid dependency issues)
  const sendCommand = useCallback((message: WebSocketMessage) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      // Debounce identical commands within 100ms
      const isIdentical =
        lastSentCommandRef.current &&
        JSON.stringify(lastSentCommandRef.current) === JSON.stringify(message);

      if (!isIdentical) {
        wsRef.current.send(JSON.stringify(message));
        lastSentCommandRef.current = message;
      }
    }
  }, []);

  // Keep sendCommand in ref so it doesn't cause effect re-runs
  useEffect(() => {
    sendCommandRef.current = sendCommand;
  }, [sendCommand]);

  // Initialize WebSocket connection
  useEffect(() => {
    if (!sessionId) {
      console.log("[WS Client] No sessionId, skipping connection");
      if (wsRef.current) {
        wsRef.current.close();
      }
      return;
    }

    const connect = () => {
      console.log("[WS Client] Initiating connection for session:", sessionId);
      const protocol =
        window.location.protocol === "https:" ? "wss:" : "ws:";
      const host = import.meta.env.VITE_WS_HOST || window.location.host;
      const wsUrl = `${protocol}//${host}/ws/replay/${sessionId}`;

      wsRef.current = new WebSocket(wsUrl);

      wsRef.current.onopen = () => {
        console.log("[WS Client] Connection opened, requesting initial frame");
        setIsConnected(true);
        reconnectAttemptRef.current = 0;
        // Request initial frame when connection opens
        if (sendCommandRef.current) {
          sendCommandRef.current({ action: "seek", frame: 0 });
        }
      };

      wsRef.current.onmessage = async (event) => {
        try {
          // Handle JSON control messages
          if (typeof event.data === 'string') {
            const message = JSON.parse(event.data);

            if (message.type === 'loading_progress') {
              console.log("[WS Client] Loading progress:", message.progress + "%");
              setLoadingProgress(message.progress || 0);
              return;
            }

            if (message.type === 'generation_progress') {
              console.log("[WS Client] Telemetry generation:", message.message);
              const progress =
                typeof message.progress === "number" ? message.progress : undefined;
              const clamped = Math.min(progress ?? 10, 99);
              setLoadingProgress(clamped);
              return;
            }

            if (message.type === 'loading_complete') {
              console.log("[WS Client] Loading complete");
              setLoadingProgress(100);
              setLoadingComplete(true);
              setLoadingError(null);

              if (message.metadata && sessionId) {
                setSession(sessionId, message.metadata);
                if (message.frames) {
                  useReplayStore.getState().setTotalFrames(message.frames);
                }
              }
              return;
            }

            if (message.type === 'loading_error') {
              console.error("[WS Client] Loading error:", message.message);
              if (!intentionalCloseRef.current) {
                setLoadingError(message.message || "Unknown error");
              }
              return;
            }

            if (message.type === 'error') {
              console.error("[WS Client] Session/WebSocket error:", message.message);
              if (!intentionalCloseRef.current) {
                setLoadingError(message.message || "Session error");
              }
              return;
            }

            console.warn("[WS Client] Unknown control message:", message);
            return;
          }

          // Handle binary msgpack frame data
          let data: Uint8Array;
          if (event.data instanceof Blob) {
            const arrayBuffer = await event.data.arrayBuffer();
            data = new Uint8Array(arrayBuffer);
          } else if (event.data instanceof ArrayBuffer) {
            data = new Uint8Array(event.data);
          } else {
            data = event.data;
          }

          const decoder = new Unpackr({
            mapsAsObjects: true,
          });
          const decoded = decoder.unpack(data) as FrameData;

          if (!decoded.error) {
            // Only process frames if: (a) it's the initial seek response, or (b) playback is active
            if (!initialFrameReceivedRef.current) {
              initialFrameReceivedRef.current = true;
              setCurrentFrame(decoded);
            } else if (useReplayStore.getState().playback.isPlaying) {
              setCurrentFrame(decoded);
            }
          } else {
            console.error("[WS Client] Frame has error property:", decoded.error);
          }
        } catch (error) {
          console.error("[WS Client] Failed to decode message:", error);
        }
      };

      wsRef.current.onerror = (error) => {
        console.error("[WS Client] WebSocket error:", error);
        setIsConnected(false);
      };

      wsRef.current.onclose = () => {
        console.log("[WS Client] WebSocket closed");
        setIsConnected(false);

        // Reconnect with exponential backoff if not intentionally closed
        if (!intentionalCloseRef.current && reconnectAttemptRef.current < MAX_RECONNECT_ATTEMPTS) {
          const delay = BASE_RECONNECT_DELAY * Math.pow(2, reconnectAttemptRef.current);
          console.log(`[WS Client] Reconnecting in ${delay}ms (attempt ${reconnectAttemptRef.current + 1}/${MAX_RECONNECT_ATTEMPTS})`);
          reconnectAttemptRef.current++;
          reconnectTimerRef.current = setTimeout(connect, delay);
        } else if (reconnectAttemptRef.current >= MAX_RECONNECT_ATTEMPTS) {
          setLoadingError("Connection lost. Please reload to reconnect.");
        }
      };
    };

    intentionalCloseRef.current = false;
    reconnectAttemptRef.current = 0;
    initialFrameReceivedRef.current = false;
    connect();

    return () => {
      console.log("[WS Client] Cleanup: closing connection for session:", sessionId);
      intentionalCloseRef.current = true;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [sessionId]);

  // Timeout: if no activity within 10s, emit error
  useEffect(() => {
    if (!sessionId) return;

    let hasReceivedMessage = false;

    timeoutRef.current = setTimeout(() => {
      if (!hasReceivedMessage) {
        setLoadingError("Unable to connect to telemetry (timeout). Please try again.");
      }
    }, 10000);

    // Subscribe to ANY loading state change and clear timeout on first message
    const unsubscribe = useReplayStore.subscribe(
      (state) => ({
        progress: state.loadingProgress,
        complete: state.isLoadingComplete,
        error: state.loadingError,
      }),
      () => {
        hasReceivedMessage = true;
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
      }
    );

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      unsubscribe();
    };
  }, [sessionId, setLoadingError]);

  // Sync playback state to WebSocket
  useEffect(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      return;
    }

    if (playback.isPlaying) {
      sendCommandRef.current?.({
        action: "play",
        speed: playback.speed,
      });
    } else {
      sendCommandRef.current?.({ action: "pause" });
    }
  }, [playback.isPlaying, playback.speed]);

  // Sync frame index (seeking) to WebSocket
  useEffect(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      return;
    }

    sendCommandRef.current?.({ action: "seek", frame: playback.frameIndex });
  }, [playback.frameIndex]);

  return {
    isConnected,
    sendSeek: (frameIndex: number) => {
      if (sendCommandRef.current) {
        sendCommandRef.current({ action: "seek", frame: frameIndex });
      }
    },
  };
};
