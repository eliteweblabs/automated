import { Box, Input, InputGroup, IconButton } from '@chakra-ui/react';
import { LuPaperclip } from 'react-icons/lu';

interface InputFormProps {
  input: string;
  setInput: (value: string) => void;
  handleSubmit: (e: React.FormEvent) => void;
}

export const InputForm = ({ input, setInput, handleSubmit }: InputFormProps) => {
  return (
    <Box p={6} borderTop="1px solid" borderColor="gray.200">
      <Box as="form" onSubmit={handleSubmit}>
        <InputGroup
          endElement={
            <IconButton
              aria-label="Attach file"
              variant="ghost"
              size="sm"
              color="gray.400"
              _hover={{ color: 'gray.600' }}
            >
              <LuPaperclip />
            </IconButton>
          }
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Write anything..."
            bg="gray.50"
            border="1px solid"
            borderColor="gray.300"
            borderRadius="xl"
            px={4}
            py={3}
            color="black"
            fontSize="0.95rem"
            _placeholder={{ color: 'gray.400' }}
            _focus={{ borderColor: 'gray.400', boxShadow: 'none' }}
          />
        </InputGroup>
      </Box>
    </Box>
  );
};
