import { BrowserProvider } from '../../providers/browser-provider';
import { AudioStreamProvider } from '../../providers/audio-stream-provider';

export default function RecordLayout({ children }: { children: React.ReactNode }) {
  return (
    <AudioStreamProvider>
      <BrowserProvider>{children}</BrowserProvider>
    </AudioStreamProvider>
  );
}
