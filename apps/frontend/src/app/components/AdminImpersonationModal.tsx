'use client';

import { useState } from 'react';
import { Button, Flex, Input, Text } from '@chakra-ui/react';
import { AppModal } from './AppModal';
import { useImpersonation } from '../../providers/impersonation-provider';

interface AdminImpersonationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AdminImpersonationModal({ isOpen, onClose }: AdminImpersonationModalProps) {
  const { impersonatedEmail, startImpersonating, stopImpersonating } = useImpersonation();
  const [email, setEmail] = useState('');

  const handleSubmit = () => {
    const trimmed = email.trim();
    if (trimmed) {
      startImpersonating(trimmed);
      setEmail('');
      onClose();
    }
  };

  const handleStop = () => {
    stopImpersonating();
    setEmail('');
    onClose();
  };

  return (
    <AppModal isOpen={isOpen} onClose={onClose} title="Admin Impersonation" size="sm">
      {impersonatedEmail ? (
        <Flex direction="column" gap={4} mt={-4}>
          <Text>
            Currently impersonating: <strong>{impersonatedEmail}</strong>
          </Text>
          <Button
            onClick={handleStop}
            bg="red.600"
            color="white"
            _hover={{ bg: 'red.700' }}
            size="sm"
          >
            Stop Impersonating
          </Button>
        </Flex>
      ) : (
        <Flex direction="column" gap={4} mt={-4}>
          <Text fontSize="sm" color="app.muted">
            Enter the email of the user you want to impersonate.
          </Text>
          <Input
            placeholder="user@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSubmit();
            }}
            bg="app.bg"
            borderColor="app.border"
          />
          <Button
            onClick={handleSubmit}
            bg="app.primary"
            color="app.onPrimary"
            _hover={{ bg: 'app.primaryAlt' }}
            size="sm"
            disabled={!email.trim()}
          >
            Impersonate
          </Button>
        </Flex>
      )}
    </AppModal>
  );
}
