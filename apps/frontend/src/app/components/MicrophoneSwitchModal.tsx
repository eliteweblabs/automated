'use client';

import React, { useEffect, useState } from 'react';
import { Dialog, Portal, Button, VStack, Text, Box, NativeSelect } from '@chakra-ui/react';

interface MicrophoneSwitchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSwitchMicrophone: (deviceId: string) => void;
  onConfirmCurrentMic: () => void;
}

export const MicrophoneSwitchModal: React.FC<MicrophoneSwitchModalProps> = ({
  isOpen,
  onClose,
  onSwitchMicrophone,
  onConfirmCurrentMic,
}) => {
  const [microphones, setMicrophones] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');

  useEffect(() => {
    if (!isOpen) return;

    navigator.mediaDevices.enumerateDevices().then((devices) => {
      const audioInputs = devices.filter((d) => d.kind === 'audioinput');
      setMicrophones(audioInputs);
      if (audioInputs.length > 0 && !selectedDeviceId) {
        setSelectedDeviceId(audioInputs[0].deviceId);
      }
    });
  }, [isOpen, selectedDeviceId]);

  return (
    <Dialog.Root
      lazyMount
      open={isOpen}
      onOpenChange={({ open }) => {
        if (!open) onClose();
      }}
      placement="center"
    >
      <Portal>
        <Dialog.Backdrop bg="blackAlpha.700" backdropFilter="blur(4px)" />
        <Dialog.Positioner>
          <Dialog.Content
            maxW="480px"
            mx={4}
            bg="appSurface"
            border="1px solid"
            borderColor="app.border"
            color="app.snow"
          >
            <Dialog.Header>
              <Dialog.Title fontSize="xl" fontWeight="bold">
                No audio detected
              </Dialog.Title>
            </Dialog.Header>
            <Dialog.Body>
              <VStack gap={4} align="stretch" mt={-4}>
                <Text color="app.muted">
                  We haven't detected any audio from your microphone. You may need to switch to a
                  different microphone.
                </Text>

                <Box mt={2}>
                  <Text fontSize="sm" fontWeight="medium" mb={2} color="app.snow">
                    Select a microphone
                  </Text>
                  <NativeSelect.Root size="md">
                    <NativeSelect.Field
                      value={selectedDeviceId}
                      onChange={(e) => setSelectedDeviceId(e.target.value)}
                      bg="app.bg"
                      borderColor="app.border"
                    >
                      {microphones.map((mic) => (
                        <option key={mic.deviceId} value={mic.deviceId}>
                          {mic.label || `Microphone ${mic.deviceId.slice(0, 8)}...`}
                        </option>
                      ))}
                    </NativeSelect.Field>
                    <NativeSelect.Indicator />
                  </NativeSelect.Root>
                </Box>

                <Box display="flex" gap={2}>
                  <Button
                    onClick={() => onSwitchMicrophone(selectedDeviceId)}
                    bg="app.primary"
                    color="app.onPrimary"
                    _hover={{ bg: 'app.primaryAlt' }}
                    flex={1}
                  >
                    Switch microphone
                  </Button>

                  <Button
                    onClick={onConfirmCurrentMic}
                    variant="outline"
                    borderColor="app.border"
                    flex={1}
                  >
                    Cancel
                  </Button>
                </Box>
              </VStack>
            </Dialog.Body>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
};
