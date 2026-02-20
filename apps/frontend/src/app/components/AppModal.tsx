'use client';

import { ReactNode } from 'react';
import { Dialog, Portal } from '@chakra-ui/react';

type ModalSize = 'sm' | 'md' | 'lg' | 'xl';

const maxWidthBySize: Record<ModalSize, string> = {
  sm: '400px',
  md: '560px',
  lg: '720px',
  xl: '900px',
};

interface AppModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: ModalSize;
}

export function AppModal({
  isOpen,
  onClose,
  title,
  children,
  footer,
  size = 'md',
}: AppModalProps) {
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
            maxW={maxWidthBySize[size]}
            mx={4}
            bg="app.bgAlt"
            border="1px solid"
            borderColor="app.border"
            color="app.snow"
            borderRadius="sm"
          >
            <Dialog.Header>
              <Dialog.Title>{title}</Dialog.Title>
            </Dialog.Header>
            <Dialog.Body>{children}</Dialog.Body>
            {footer ? <Dialog.Footer>{footer}</Dialog.Footer> : null}
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
