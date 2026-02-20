'use client';

import { useRef, useEffect, useCallback } from 'react';
import { useAudioStream } from '../../providers/audio-stream-provider';
import {
  Dialog,
  Button,
  HStack,
  Box,
  Portal,
  CloseButton,
} from '@chakra-ui/react';

export function VideoPreviewModal(props: {
  handleReRecord?: () => void;
  handleApproveRecording: () => Promise<void>;
  handleReRecordProvider: () => void;
  isInitialMount?: boolean;
}) {
  const {
    recordingStatus,
    recordedAudioUrl,
    getAudioOffsetMs,
  } = useAudioStream();
  const { handleReRecord: handleReRecordPage, handleApproveRecording, handleReRecordProvider, isInitialMount } = props;

  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const audioOffsetSecRef = useRef<number>(0);

  // Calculate offset once when modal opens
  useEffect(() => {
    const offsetMs = getAudioOffsetMs();
    audioOffsetSecRef.current = offsetMs / 1000;
    console.log('[PREVIEW] ========== SYNC DEBUG ==========');
    console.log('[PREVIEW] Audio offset (ms):', offsetMs);
    console.log('[PREVIEW] Audio offset (sec):', audioOffsetSecRef.current);
    console.log('[PREVIEW] This means audio started', offsetMs, 'ms before video');
  }, [getAudioOffsetMs]);

  // Sync audio time with video time
  const syncAudioToVideo = useCallback(() => {
    const video = videoRef.current;
    const audio = audioRef.current;
    if (!video || !audio) return;

    const targetAudioTime = video.currentTime + audioOffsetSecRef.current;
    const drift = audio.currentTime - targetAudioTime;

    console.log('[SYNC] Video:', video.currentTime.toFixed(3) + 's',
      '+ Offset:', audioOffsetSecRef.current.toFixed(3) + 's',
      '= Target audio:', targetAudioTime.toFixed(3) + 's',
      '| Actual audio:', audio.currentTime.toFixed(3) + 's',
      '| Drift:', drift.toFixed(3) + 's');

    // Only sync if there's a significant drift (> 100ms)
    if (Math.abs(drift) > 0.1) {
      console.log('[SYNC] Correcting drift of', drift.toFixed(3), 'seconds');
      audio.currentTime = Math.max(0, targetAudioTime);
    }
  }, []);

  // Handle video events to sync audio
  useEffect(() => {
    const video = videoRef.current;
    const audio = audioRef.current;
    if (!video || !audio) return;

    const handleVideoLoadedMetadata = () => {
      console.log('[PREVIEW] Video metadata loaded:');
      console.log('  - Duration:', video.duration, 'seconds');
      console.log('  - Video dimensions:', video.videoWidth, 'x', video.videoHeight);
    };

    const handleAudioLoadedMetadata = () => {
      console.log('[PREVIEW] Audio metadata loaded:');
      console.log('  - Duration:', audio.duration, 'seconds');
    };

    const handlePlay = () => {
      console.log('[PREVIEW] Play event - syncing audio to video');
      syncAudioToVideo();
      audio.play().catch(console.error);
    };

    const handlePause = () => {
      console.log('[PREVIEW] Pause event');
      audio.pause();
    };

    const handleSeeked = () => {
      console.log('[PREVIEW] Seeked event - re-syncing');
      syncAudioToVideo();
    };

    const handleTimeUpdate = () => {
      // Periodically check sync (every ~500ms worth of drift)
      const targetAudioTime = video.currentTime + audioOffsetSecRef.current;
      if (Math.abs(audio.currentTime - targetAudioTime) > 0.5) {
        console.log('[PREVIEW] Large drift detected, correcting...');
        audio.currentTime = Math.max(0, targetAudioTime);
      }
    };

    video.addEventListener('loadedmetadata', handleVideoLoadedMetadata);
    audio.addEventListener('loadedmetadata', handleAudioLoadedMetadata);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('seeked', handleSeeked);
    video.addEventListener('timeupdate', handleTimeUpdate);

    // Initial sync if video autoplays
    if (!video.paused) {
      console.log('[PREVIEW] Video is autoplaying, syncing now');
      syncAudioToVideo();
      audio.play().catch(console.error);
    }

    return () => {
      video.removeEventListener('loadedmetadata', handleVideoLoadedMetadata);
      audio.removeEventListener('loadedmetadata', handleAudioLoadedMetadata);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('seeked', handleSeeked);
      video.removeEventListener('timeupdate', handleTimeUpdate);
    };
  }, [syncAudioToVideo, recordedAudioUrl]);

  const onReRecord = () => {
    if (handleReRecordPage) handleReRecordPage();
    handleReRecordProvider();
  };

  const isOpen = !!(recordingStatus && recordingStatus.localVideoUrl && !isInitialMount);

  return (
    <Dialog.Root lazyMount open={isOpen} closeOnInteractOutside={false} >
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content maxWidth="1200px">
            <Dialog.Header>
              <Dialog.Title>
                Review Your Recording
              </Dialog.Title>
            </Dialog.Header>

            <Dialog.CloseTrigger asChild>
              <CloseButton size="sm" onClick={onReRecord} />
            </Dialog.CloseTrigger>

            <Dialog.Body p={4}>
              <Box>
                <video
                  ref={videoRef}
                  src={recordingStatus?.localVideoUrl}
                  controls
                  autoPlay
                  style={{ width: '100%', height: '100%', borderRadius: "10px", overflow: "hidden" }}
                />
                {recordedAudioUrl && (
                  <audio ref={audioRef} src={recordedAudioUrl} />
                )}
              </Box>
            </Dialog.Body>

            <Dialog.Footer mt={-2}>
              <HStack gap={4} width="full">
                <Button
                  onClick={handleApproveRecording}
                  loading={recordingStatus?.status === 'processing'}
                  loadingText="Processing..."
                  flex={1}
                  size="xl"
                >
                  Looks Good
                </Button>
                <Button
                  onClick={onReRecord}
                  flex={1}
                  variant="outline"
                  colorPalette="red"
                  size="xl"
                >
                  Re-record
                </Button>
              </HStack>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
