import { InteractionsList } from './InteractionsList';
import { InputForm } from './InputForm';
import { Box, Heading, Text } from '@chakra-ui/react';

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

interface SidebarProps {
  input: string;
  setInput: (value: string) => void;
  handleSubmit: (e: React.FormEvent) => void;
  interactions: Interaction[];
}

export const Sidebar = ({ input, setInput, handleSubmit, interactions }: SidebarProps) => {
  return (
    <Box
      as="aside"
      width="600px"
      bg="white"
      color="black"
      display="flex"
      flexDirection="column"
      borderRight="1px solid"
      borderColor="gray.200"
      transition="all 0.3s"
    >
      <Box flex={1} p={8} overflowY="auto">
        <Heading size="xl" fontWeight="semibold" mb={4} lineHeight="normal">
          Automate any workflow
        </Heading>
        <Text color="gray.600" mb={8} lineHeight="relaxed">
          Show Deskglide how to do it once by using the screen on the right.
        </Text>

        <InteractionsList interactions={interactions} />
      </Box>

      <InputForm input={input} setInput={setInput} handleSubmit={handleSubmit} />
    </Box>
  );
};
