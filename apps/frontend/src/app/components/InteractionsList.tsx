import { Box, VStack, Heading, Text, Badge, Code, Flex } from '@chakra-ui/react';

interface Interaction {
  id: string;
  type: 'user_event' | 'tab_navigation' | 'frame_navigation';
  timestamp: number;
  element: {
    tagName?: string;
    text?: string;
    selector?: string;
    href?: string;
    [key: string]: any;
  };
  data?: any;
}

interface InteractionsListProps {
  interactions: Interaction[];
}

export const InteractionsList = ({ interactions }: InteractionsListProps) => {
  return (
    <Box mt={8}>
      <Heading size="lg" fontWeight="semibold" mb={3}>
        Interactions
      </Heading>
      <VStack gap={4} align="stretch">
        {interactions.length === 0 ? (
          <Box
            textAlign="center"
            py={10}
            bg="gray.50"
            borderRadius="xl"
            border="2px dashed"
            borderColor="gray.200"
          >
            <Text color="gray.400" fontStyle="italic" px={4}>
              No interactions yet. Record your workflow and start clicking in the browser!
            </Text>
          </Box>
        ) : (
          interactions.map((interaction) => (
            <Box
              key={interaction.id}
              p={4}
              bg="white"
              borderRadius="xl"
              border="1px solid"
              borderColor="gray.200"
              shadow="sm"
              _hover={{ borderColor: 'blue.300' }}
              transition="border-color 0.2s"
            >
              <Flex justify="space-between" align="flex-start" mb={2}>
                <Badge
                  px={2}
                  py={0.5}
                  borderRadius="sm"
                  fontSize="10px"
                  fontWeight="bold"
                  textTransform="uppercase"
                  letterSpacing="wider"
                  bg={
                    interaction.type === 'user_event'
                      ? 'blue.50'
                      : interaction.type === 'tab_navigation'
                        ? 'purple.50'
                        : 'green.50'
                  }
                  color={
                    interaction.type === 'user_event'
                      ? 'blue.600'
                      : interaction.type === 'tab_navigation'
                        ? 'purple.600'
                        : 'green.600'
                  }
                >
                  {interaction.type === 'user_event'
                    ? interaction.data?.type || 'Event'
                    : interaction.type === 'tab_navigation'
                      ? 'Tab'
                      : 'Nav'}
                </Badge>
                <Text fontSize="10px" color="gray.400">
                  {new Date(interaction.timestamp).toLocaleTimeString()}
                </Text>
              </Flex>
              <Text color="gray.800" fontWeight="semibold" mb={1} wordBreak="break-all">
                {interaction.element?.text || interaction.element?.tagName || 'Interaction'}
              </Text>
              {interaction.element?.selector && (
                <Code
                  display="block"
                  bg="gray.50"
                  p={2}
                  borderRadius="sm"
                  fontSize="10px"
                  color="gray.500"
                  wordBreak="break-all"
                  border="1px solid"
                  borderColor="gray.100"
                >
                  {interaction.element.selector}
                </Code>
              )}
              {interaction.element?.href && (
                <Text fontSize="10px" color="blue.500" mt={2}>
                  🔗 {interaction.element.href}
                </Text>
              )}
            </Box>
          ))
        )}
      </VStack>
    </Box>
  );
};
