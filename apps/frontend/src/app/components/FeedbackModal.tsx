'use client';

import { useState } from 'react';
import { Box, Button, HStack, IconButton, Text, Textarea, VStack } from '@chakra-ui/react';
import { usePathname } from 'next/navigation';
import posthog from 'posthog-js';
import { FiMessageSquare } from 'react-icons/fi';
import { AppModal } from './AppModal';

export function FeedbackModal() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [feedback, setFeedback] = useState('');
  const feedbackValue = feedback.trim();

  const handleClose = () => {
    setIsOpen(false);
    setFeedback('');
  };

  const handleSubmit = () => {
    if (!feedbackValue) return;

    posthog.capture('feedback_submitted', {
      feedback: feedbackValue,
      path: pathname,
      source: 'floating_feedback_modal',
    });

    handleClose();
  };

  return (
    <>
      <Box position="fixed" right={{ base: 4, md: 6 }} bottom={{ base: 4, md: 6 }} zIndex={900}>
        <IconButton
          aria-label="Open feedback modal"
          size="sm"
          bg="app.primary"
          color="app.onPrimary"
          _hover={{ bg: 'app.primaryAlt' }}
          onClick={() => setIsOpen(true)}
          borderRadius="full"
        >
          <FiMessageSquare />
        </IconButton>
      </Box>

      <AppModal
        isOpen={isOpen}
        onClose={handleClose}
        title="Share feedback"
        size="md"
        footer={
          <HStack w="full" justify="flex-end">
            <Button
              size="sm"
              variant="outline"
              borderColor="app.border"
              color="app.snow"
              _hover={{ bg: 'whiteAlpha.700' }}
              onClick={handleClose}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              bg="app.primary"
              color="app.onPrimary"
              _hover={{ bg: 'app.primaryAlt' }}
              onClick={handleSubmit}
              disabled={!feedbackValue}
            >
              Send
            </Button>
          </HStack>
        }
      >
        <VStack align="stretch" gap={3} mt={-4}>
          <Text fontSize="sm" color="app.muted">
            Tell us what should be improved.
          </Text>
          <Textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="Write feedback..."
            rows={5}
            resize="vertical"
            bg="white"
            borderColor="app.border"
            _placeholder={{ color: 'app.muted' }}
          />
        </VStack>
      </AppModal>
    </>
  );
}
