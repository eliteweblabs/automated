import { Box, VStack, Spinner, Text } from '@chakra-ui/react';

interface BrowserOverlayProps {
  isLoading: boolean;
  onClick?: () => void;
  minimal?: boolean;
}

export const BrowserOverlay = ({ isLoading, onClick, minimal }: BrowserOverlayProps) => {
  return (
    <Box
      position="absolute"
      inset={0}
      zIndex={50}
      display="flex"
      alignItems="center"
      justifyContent="center"
      bg="blackAlpha.50"
      cursor={"not-allowed"}
    >
      {isLoading && !minimal ? (
        <VStack gap={3}>
          <Spinner
            size="xl"
            color="black"
          />
          <Text color="black" fontWeight="medium">
            Connecting...
          </Text>
        </VStack>
      ) : null}
    </Box>
  );
};
