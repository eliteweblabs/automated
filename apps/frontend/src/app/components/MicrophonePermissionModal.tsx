'use client';

import React from 'react';
import {
  DialogRoot,
  DialogBackdrop,
  DialogContent,
  DialogHeader,
  DialogBody,
  Button,
  VStack,
  HStack,
  Text,
  Circle,
} from '@chakra-ui/react';

interface MicrophonePermissionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGetStarted: () => void;
  isMicrophoneGranted: boolean;
}

export const MicrophonePermissionModal: React.FC<MicrophonePermissionModalProps> = ({
  isOpen,
  onClose,
  onGetStarted,
  isMicrophoneGranted,
}) => {
  return (
    <DialogRoot open={isOpen} onOpenChange={({ open }) => !open && onClose()} placement="center" size="md">
      <DialogBackdrop bg="blackAlpha.500" backdropFilter="blur(4px)" />
      <DialogContent
        bg="white"
        borderRadius="2xl"
        shadow="2xl"
        p={8}
        textAlign="center"
      >
        <DialogHeader p={0} mb={4}>
          <Text fontSize="2xl" fontWeight="bold" color="gray.900">
            How to use DeskGlide
          </Text>
        </DialogHeader>

        <DialogBody p={0}>
          <VStack gap={4} align="stretch" mb={6} textAlign="left">
            <HStack gap={3} align="flex-start">
              <Circle size="24px" bg="blue.100" color="blue.600" flexShrink={0}>
                <Text fontSize="sm" fontWeight="bold">
                  1
                </Text>
              </Circle>
              <Text color="gray.600">
                <Text as="span" fontWeight="semibold" color="gray.900">
                  Enable your microphone
                </Text>{' '}
                so we can capture your voice instructions while you work.
              </Text>
            </HStack>
            <HStack gap={3} align="flex-start">
              <Circle size="24px" bg="blue.100" color="blue.600" flexShrink={0}>
                <Text fontSize="sm" fontWeight="bold">
                  2
                </Text>
              </Circle>
              <Text color="gray.600">
                <Text as="span" fontWeight="semibold" color="gray.900">
                  Narrate your workflow
                </Text>{' '}
                in the secure browser below. Your recording and browser are private and used only to build your automation.
              </Text>
            </HStack>
          </VStack>

          <Button
            onClick={onGetStarted}
            disabled={!isMicrophoneGranted}
            width="full"
            fontWeight="semibold"
            py={3}
            px={6}
            borderRadius="xl"
            shadow="lg"
            bg={isMicrophoneGranted ? 'black' : 'gray.200'}
            color={isMicrophoneGranted ? 'white' : 'gray.400'}
            _hover={
              isMicrophoneGranted
                ? { bg: 'gray.800' }
                : {}
            }
            _active={
              isMicrophoneGranted
                ? { transform: 'scale(0.95)' }
                : {}
            }
            cursor={isMicrophoneGranted ? 'pointer' : 'not-allowed'}
          >
            {isMicrophoneGranted ? 'Get Started' : 'Waiting for microphone...'}
          </Button>
        </DialogBody>
      </DialogContent>
    </DialogRoot>
  );
};
