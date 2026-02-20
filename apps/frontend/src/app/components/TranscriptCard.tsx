import { Box, Text, Flex } from '@chakra-ui/react';
import { useState } from 'react';

interface TranscriptCardProps {
  transcript: string;
}

const AudioIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <line x1="12" x2="12" y1="19" y2="22" />
  </svg>
);

const TRUNCATE_LENGTH = 80;

export const TranscriptCard = ({ transcript }: TranscriptCardProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const shouldTruncate = transcript.length > TRUNCATE_LENGTH;
  const displayText =
    shouldTruncate && !isExpanded ? transcript.substring(0, TRUNCATE_LENGTH) + '...' : transcript;

  return (
    <Box
      bg="app.bgAlt"
      px={3}
      py={2}
      cursor={shouldTruncate ? 'pointer' : 'default'}
      onClick={() => shouldTruncate && setIsExpanded(!isExpanded)}
      transition="all 0.2s"
      border="1px solid"
      borderColor="app.border"
      borderRadius="sm"
    >
      <Flex align="flex-start" gap={2}>
        <Box color="app.muted" flexShrink={0} mt={0.5}>
          <AudioIcon />
        </Box>
        <Box flex={1}>
          <Text fontSize="xs" color="app.muted" fontStyle="italic">
            "{displayText}"
            {shouldTruncate && !isExpanded && (
              <Text as="span" color="app.muted" fontStyle="normal" ml={1}>
                (click to expand)
              </Text>
            )}
          </Text>
        </Box>
      </Flex>
    </Box>
  );
};

interface NextStepPlaceholderProps {
  stepNumber: number;
  pendingTranscript?: string;
}

export const NextStepPlaceholder = ({
  stepNumber,
  pendingTranscript,
}: NextStepPlaceholderProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const shouldTruncate = pendingTranscript && pendingTranscript.length > TRUNCATE_LENGTH;
  const displayText =
    pendingTranscript && shouldTruncate && !isExpanded
      ? pendingTranscript.substring(0, TRUNCATE_LENGTH) + '...'
      : pendingTranscript;

  return (
    <Flex
      align="center"
      gap={3}
      px={3}
      py={3}
      cursor={shouldTruncate ? 'pointer' : 'default'}
      onClick={() => shouldTruncate && setIsExpanded(!isExpanded)}
    >
      <Flex
        w="28px"
        h="28px"
        color="app.snow"
        align="center"
        justify="center"
        flexShrink={0}
        fontSize="sm"
        fontWeight="semibold"
      >
        {stepNumber}
      </Flex>
      {pendingTranscript ? (
        <Text fontSize="sm" color="app.muted" fontStyle="italic">
          "{displayText}"
          {shouldTruncate && !isExpanded && (
            <Text as="span" color="app.muted" fontStyle="normal" ml={1}>
              (click to expand)
            </Text>
          )}
        </Text>
      ) : (
        <Text fontSize="sm" color="app.muted" fontStyle="italic">
          Listening...
        </Text>
      )}
    </Flex>
  );
};
