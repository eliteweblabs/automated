'use client';

import { ChakraProvider } from '@chakra-ui/react';
import { ColorModeProvider } from '../components/ui/color-mode';
import { Toaster } from '../components/ui/toaster';
import { system } from '../theme';
import { ReactNode } from 'react';

export function ChakraUIProvider({ children }: { children: ReactNode }) {
  return (
    <ChakraProvider value={system}>
      <ColorModeProvider forcedTheme="light">
        {children}
        {/* <Toaster /> */}
      </ColorModeProvider>
    </ChakraProvider>
  );
}
