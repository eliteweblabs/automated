import React, { useEffect, useRef } from 'react';
import { Box } from '@chakra-ui/react';

interface AudioWaveformProps {
  stream: MediaStream;
}

export const AudioWaveform: React.FC<AudioWaveformProps> = ({ stream }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dataPointsRef = useRef<number[]>(new Array(75).fill(4)); // Fits 300px canvas (75 * 4 = 300)

  useEffect(() => {
    if (!stream) return;

    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const analyser = audioContext.createAnalyser();
    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);

    analyser.fftSize = 256;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const canvas = canvasRef.current;
    if (!canvas) return;
    const canvasCtx = canvas.getContext('2d');
    if (!canvasCtx) return;

    let animationId: number;
    let lastTime = Date.now();

    const draw = () => {
      animationId = requestAnimationFrame(draw);

      const now = Date.now();
      // Increase sampling frequency to 40ms for smoother transitions
      if (now - lastTime > 40) {
        analyser.getByteTimeDomainData(dataArray);

        let max = 0;
        for (let i = 0; i < bufferLength; i++) {
          const amplitude = Math.abs(dataArray[i] - 128);
          if (amplitude > max) max = amplitude;
        }

        // Scale the value
        const targetValue = Math.max(4, (max / 64) * 36);

        // Use the last value to interpolate if available
        const lastValue = dataPointsRef.current[dataPointsRef.current.length - 1] || 4;
        // Simple smoothing: 70% new value, 30% old value
        const smoothedValue = lastValue + (targetValue - lastValue) * 0.7;

        dataPointsRef.current.push(smoothedValue);
        if (dataPointsRef.current.length > 75) {
          dataPointsRef.current.shift();
        }
        lastTime = now;
      }

      const width = canvas.width;
      const height = canvas.height;
      canvasCtx.clearRect(0, 0, width, height);

      const barWidth = 2; // Slightly thinner bars for smoother "wave"
      const gap = 2;
      const totalBarWidth = barWidth + gap;

      const totalWaveformWidth = dataPointsRef.current.length * totalBarWidth - gap;
      const xOffset = (width - totalWaveformWidth) / 2;

      canvasCtx.fillStyle = '#000000';

      dataPointsRef.current.forEach((value, i) => {
        const x = xOffset + i * totalBarWidth;
        const barHeight = value / 2;
        const baseline = 80; // Shifting baseline down to center the "top-half" waveform vertically
        const y = baseline - barHeight;

        canvasCtx.beginPath();
        if (canvasCtx.roundRect) {
          canvasCtx.roundRect(x, y, barWidth, barHeight, 1);
        } else {
          canvasCtx.rect(x, y, barWidth, barHeight);
        }
        canvasCtx.fill();
      });
    };

    draw();

    return () => {
      cancelAnimationFrame(animationId);
      audioContext.close();
    };
  }, [stream]);

  return (
    <Box
      as="canvas"
      ref={canvasRef}
      width="300px"
      height="40px"
      opacity={1}
    />
  );
};
