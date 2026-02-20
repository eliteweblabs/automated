'use client';

import { createContext, useContext, useState, ReactNode, useRef, useCallback } from 'react';
import { useDeepgramToken } from '../hooks/api';

interface AudioStreamContextType {
  audioStream: MediaStream | null;
  setAudioStream: React.Dispatch<React.SetStateAction<MediaStream | null>>;
  recordingStatus: {
    status: 'idle' | 'processing' | 'completed' | 'failed';
    sessionId?: string;
    localVideoUrl?: string;
  } | null;
  setRecordingStatus: (
    status: {
      status: 'idle' | 'processing' | 'completed' | 'failed';
      sessionId?: string;
      localVideoUrl?: string;
    } | null,
  ) => void;
  setLocalVideoUrl: (url: string) => void;
  startAudioRecording: () => void;
  stopAudioRecording: () => Promise<Blob | null>;
  setVideoRecordingStartTime: (timestamp: number) => void;
  videoRecordingStartTime: number | null;
  resetRecordingTimes: () => void;
  getAudioOffsetMs: () => number;
  recordedAudioUrl: string | null;
  recordedAudioBlob: Blob | null;
  transcripts: string[];
  clearTranscripts: () => void;
  startSpeechToText: (sessionId: string, streamOverride?: MediaStream) => Promise<void>;
  stopSpeechToText: (sessionId: string) => void;
}

const AudioStreamContext = createContext<AudioStreamContextType | undefined>(undefined);

export function AudioStreamProvider({ children }: { children: ReactNode }) {
  const [audioStream, setAudioStream] = useState<MediaStream | null>(null);
  const [recordingStatus, setRecordingStatus] = useState<{
    status: 'idle' | 'processing' | 'completed' | 'failed';
    sessionId?: string;
    localVideoUrl?: string;
  } | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const [recordedAudioBlob, setRecordedAudioBlob] = useState<Blob | null>(null);
  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(null);
  const audioRecordingStartTimeRef = useRef<number | null>(null);
  const videoRecordingStartTimeRef = useRef<number | null>(null);
  const [videoRecordingStartTime, setVideoRecordingStartTimeState] = useState<number | null>(null);
  const [audioVideoOffsetMs, setAudioVideoOffsetMs] = useState<number>(0);
  const [transcripts, setTranscripts] = useState<string[]>([]);
  const socketRef = useRef<WebSocket | null>(null);
  const webSpeechRef = useRef<SpeechRecognition | null>(null);

  const getDeepgramToken = useDeepgramToken();

  const clearTranscripts = useCallback(() => {
    setTranscripts([]);
  }, []);

  const startWebSpeechFallback = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.error('[AUDIO PROVIDER] Web Speech API not supported in this browser');
      return;
    }

    console.log('[AUDIO PROVIDER] Starting Web Speech API fallback');

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    webSpeechRef.current = recognition;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      // Process only the latest result
      const lastResult = event.results[event.results.length - 1];
      const transcript = lastResult[0].transcript.trim();
      if (!transcript) return;

      if (lastResult.isFinal) {
        setTranscripts((prev) => {
          const newTranscripts = prev.filter((t) => !t.endsWith('...'));
          return [...newTranscripts, transcript];
        });
      } else {
        setTranscripts((prev) => {
          const newTranscripts = prev.filter((t) => !t.endsWith('...'));
          return [...newTranscripts, transcript + '...'];
        });
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      // 'no-speech' is expected when the user is silent, don't log it as an error
      if (event.error === 'no-speech') return;
      console.error('[AUDIO PROVIDER] Web Speech API error:', event.error);
    };

    recognition.onend = () => {
      // Auto-restart if still referenced (recognition can stop unexpectedly)
      if (webSpeechRef.current === recognition) {
        console.log('[AUDIO PROVIDER] Web Speech API ended, restarting...');
        try {
          recognition.start();
        } catch {
          // Already started or disposed
        }
      }
    };

    recognition.start();
  }, []);

  const startSpeechToText = useCallback(
    async (sessionId: string, streamOverride?: MediaStream) => {
      const stream = streamOverride || audioStream;
      if (!stream) {
        console.error('[AUDIO PROVIDER] No audio stream available for speech-to-text');
        return;
      }

      console.log('[AUDIO PROVIDER] Starting speech-to-text session');

      try {
        const { key } = await getDeepgramToken.mutateAsync();

        // Deepgram streaming URL
        const url =
          'wss://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&interim_results=true';
        const socket = new WebSocket(url, ['token', key]);
        socketRef.current = socket;

        socket.onopen = () => {
          console.log('[AUDIO PROVIDER] Deepgram connection opened');

          // Use MediaRecorder to stream audio chunks to Deepgram
          const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
          mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0 && socket.readyState === WebSocket.OPEN) {
              socket.send(event.data);
            }
          };
          mediaRecorder.start(250); // Send chunks every 250ms
        };

        socket.onmessage = (message) => {
          const received = JSON.parse(message.data);
          if (received.channel && received.channel.alternatives) {
            const transcript = received.channel.alternatives[0].transcript;

            if (transcript && received.is_final) {
              setTranscripts((prev) => {
                // Remove the last interim transcript if it exists
                const newTranscripts = prev.filter((t) => !t.endsWith('...'));
                return [...newTranscripts, transcript];
              });
            } else if (transcript) {
              setTranscripts((prev) => {
                // Replace the last interim transcript or add a new one
                const newTranscripts = prev.filter((t) => !t.endsWith('...'));
                return [...newTranscripts, transcript + '...'];
              });
            }
          }
        };

        socket.onerror = (error) => {
          console.error('[AUDIO PROVIDER] Deepgram error:', error);
        };

        socket.onclose = () => {
          console.log('[AUDIO PROVIDER] Deepgram connection closed');
        };
      } catch (error) {
        console.warn('[AUDIO PROVIDER] Deepgram unavailable, falling back to Web Speech API:', error);
        startWebSpeechFallback();
      }
    },
    [audioStream, getDeepgramToken, startWebSpeechFallback],
  );

  const stopSpeechToText = useCallback((sessionId: string) => {
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }
    if (webSpeechRef.current) {
      const recognition = webSpeechRef.current;
      webSpeechRef.current = null; // Clear ref first to prevent auto-restart in onend
      recognition.stop();
    }
  }, []);

  const setLocalVideoUrl = useCallback((url: string) => {
    setRecordingStatus((prev) =>
      prev
        ? { ...prev, localVideoUrl: url, status: 'completed' }
        : { status: 'completed', localVideoUrl: url },
    );
  }, []);

  const startAudioRecording = useCallback(() => {
    if (!audioStream) return;
    if (mediaRecorderRef.current?.state === 'recording') return;

    audioChunksRef.current = [];
    setRecordedAudioBlob(null);

    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm';

    const recorder = new MediaRecorder(audioStream, { mimeType });
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        audioChunksRef.current.push(event.data);
      }
    };
    recorder.onstop = () => {
      if (audioChunksRef.current.length > 0) {
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        setRecordedAudioBlob(blob);
        const url = URL.createObjectURL(blob);
        setRecordedAudioUrl(url);
      }
    };

    recorder.start(200);
    mediaRecorderRef.current = recorder;
    audioRecordingStartTimeRef.current = Date.now();
    console.log('[AUDIO] ========== AUDIO RECORDING START ==========');
    console.log('[AUDIO] Recording started at timestamp:', audioRecordingStartTimeRef.current);
    console.log(
      '[AUDIO] Formatted time:',
      new Date(audioRecordingStartTimeRef.current).toISOString(),
    );
  }, [audioStream]);

  const stopAudioRecording = useCallback(async () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') {
      return recordedAudioBlob;
    }

    return await new Promise<Blob | null>((resolve) => {
      const handleStop = () => {
        recorder.removeEventListener('stop', handleStop);
        resolve(
          audioChunksRef.current.length > 0
            ? new Blob(audioChunksRef.current, { type: recorder.mimeType })
            : recordedAudioBlob,
        );
      };
      recorder.addEventListener('stop', handleStop);
      recorder.stop();
      mediaRecorderRef.current = null;
    });
  }, [recordedAudioBlob]);

  const setVideoRecordingStartTime = useCallback((timestamp: number) => {
    videoRecordingStartTimeRef.current = timestamp;
    setVideoRecordingStartTimeState(timestamp);
    console.log('[VIDEO] ========== VIDEO RECORDING START ==========');
    console.log('[VIDEO] Recording started at timestamp:', timestamp);
    console.log('[VIDEO] Formatted time:', new Date(timestamp).toISOString());
    if (audioRecordingStartTimeRef.current) {
      const offsetMs = Math.max(0, timestamp - audioRecordingStartTimeRef.current);
      console.log('[SYNC] ========== OFFSET CALCULATION ==========');
      console.log('[SYNC] Audio started at:', audioRecordingStartTimeRef.current);
      console.log('[SYNC] Video started at:', timestamp);
      console.log(
        '[SYNC] Audio-video offset:',
        offsetMs,
        'ms (',
        (offsetMs / 1000).toFixed(3),
        'seconds)',
      );
      console.log('[SYNC] Audio started', offsetMs, 'ms BEFORE video');
      setAudioVideoOffsetMs(offsetMs);
    }
  }, []);

  const getAudioOffsetMs = useCallback(() => {
    return audioVideoOffsetMs;
  }, [audioVideoOffsetMs]);

  const resetRecordingTimes = useCallback(() => {
    audioRecordingStartTimeRef.current = null;
    videoRecordingStartTimeRef.current = null;
    setVideoRecordingStartTimeState(null);
    setAudioVideoOffsetMs(0);
  }, []);

  return (
    <AudioStreamContext.Provider
      value={{
        audioStream,
        setAudioStream,
        recordingStatus,
        setRecordingStatus,
        setLocalVideoUrl,
        startAudioRecording,
        stopAudioRecording,
        setVideoRecordingStartTime,
        videoRecordingStartTime,
        resetRecordingTimes,
        getAudioOffsetMs,
        recordedAudioUrl,
        recordedAudioBlob,
        transcripts,
        clearTranscripts,
        startSpeechToText,
        stopSpeechToText,
      }}
    >
      {children}
    </AudioStreamContext.Provider>
  );
}

export function useAudioStream() {
  const context = useContext(AudioStreamContext);
  if (context === undefined) {
    throw new Error('useAudioStream must be used within an AudioStreamProvider');
  }
  return context;
}
