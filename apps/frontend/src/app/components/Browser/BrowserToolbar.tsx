import { useState, useRef, useEffect, KeyboardEvent, FocusEvent } from 'react';
import { Flex, HStack, IconButton, Input } from '@chakra-ui/react';
import { LuArrowLeft, LuArrowRight, LuRefreshCw, LuInfo } from 'react-icons/lu';

interface Page {
  id: string;
  title?: string;
  url?: string;
  isSkeleton?: boolean;
}

interface BrowserToolbarProps {
  pages: Page[];
  activePageIndex: number;
  sessionId: string | null;
  refreshPages: (sessionId: string) => void;
  onNavigate?: (url: string) => void;
  onGoBack?: () => void;
  onGoForward?: () => void;
  onReload?: () => void;
  focusUrlBar?: number;
  readOnly?: boolean;
}

export const BrowserToolbar = ({ pages, activePageIndex, sessionId, refreshPages, onNavigate, onGoBack, onGoForward, onReload, focusUrlBar, readOnly }: BrowserToolbarProps) => {
  const currentPage = pages[activePageIndex];
  const currentUrl = currentPage?.url || '';

  const [isFocused, setIsFocused] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus URL bar when focusUrlBar is called
  useEffect(() => {
    if (focusUrlBar && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [focusUrlBar]);

  // Clear pending URL when tab changes
  useEffect(() => {
    setPendingUrl(null);
  }, [activePageIndex]);

  // Clear pending URL when currentUrl matches it (navigation completed)
  useEffect(() => {
    if (pendingUrl && currentUrl === pendingUrl) {
      setPendingUrl(null);
    }
  }, [currentUrl, pendingUrl]);

  const handleFocus = (e: FocusEvent<HTMLInputElement>) => {
    setIsFocused(true);
    // Use pending URL if we're waiting for navigation, otherwise use current URL
    const urlToEdit = pendingUrl || currentUrl;
    setUrlInput(urlToEdit);
    // Select all text after a brief delay to ensure the value is set
    requestAnimationFrame(() => {
      e.target.select();
    });
  };

  const handleBlur = () => {
    setIsFocused(false);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && urlInput.trim()) {
      e.preventDefault();
      let url = urlInput.trim();

      // Add https:// if no protocol specified
      if (!url.match(/^https?:\/\//i)) {
        // Check if it looks like a URL (has a dot) or is a search query
        if (url.includes('.') && !url.includes(' ')) {
          url = 'https://' + url;
        } else {
          // Treat as a Google search
          url = 'https://www.google.com/search?q=' + encodeURIComponent(url);
        }
      }

      // Set pending URL so we show it until navigation completes
      setPendingUrl(url);
      onNavigate?.(url);
      setIsFocused(false);
      inputRef.current?.blur();
    } else if (e.key === 'Escape') {
      setIsFocused(false);
      inputRef.current?.blur();
    }
  };

  // Display value logic:
  // - When focused: show urlInput (editable)
  // - When not focused: show pendingUrl if waiting for nav, otherwise currentUrl
  const displayValue = isFocused ? urlInput : (pendingUrl || currentUrl);

  return (
    <Flex align="center" gap={3} px={3} py={2} bg="white" borderBottom="1px solid" borderColor="gray.200">
      <HStack gap={2}>
        <IconButton
          aria-label="Go back"
          onClick={onGoBack}
          disabled={!sessionId}
          size="sm"
          borderRadius="full"
          variant="ghost"
          color={!sessionId ? 'gray.400' : 'gray.600'}
          opacity={!sessionId ? 0.5 : 1}
          cursor={!sessionId ? 'not-allowed' : 'pointer'}
          _hover={!sessionId ? {} : { bg: 'gray.100' }}
        >
          <LuArrowLeft />
        </IconButton>
        <IconButton
          aria-label="Go forward"
          onClick={onGoForward}
          disabled={!sessionId}
          size="sm"
          borderRadius="full"
          variant="ghost"
          color={!sessionId ? 'gray.400' : 'gray.600'}
          opacity={!sessionId ? 0.5 : 1}
          cursor={!sessionId ? 'not-allowed' : 'pointer'}
          _hover={!sessionId ? {} : { bg: 'gray.100' }}
        >
          <LuArrowRight />
        </IconButton>
        <IconButton
          aria-label="Refresh"
          onClick={onReload || (() => sessionId && refreshPages(sessionId))}
          disabled={!sessionId}
          size="sm"
          borderRadius="full"
          variant="ghost"
          color="gray.600"
          opacity={!sessionId ? 0.5 : 1}
          cursor={!sessionId ? 'not-allowed' : 'pointer'}
          _hover={!sessionId ? {} : { bg: 'gray.100' }}
        >
          <LuRefreshCw />
        </IconButton>
      </HStack>

      <Flex
        flex={1}
        minW={0}
        bg={isFocused ? 'white' : '#F1F3F4'}
        borderRadius="full"
        px={4}
        h="32px"
        align="center"
        gap={2}
        border="1px solid"
        borderColor={isFocused ? '#1A73E8' : 'transparent'}
        boxShadow={isFocused ? '0 0 0 1px #1A73E8' : 'none'}
        transition="all 0.15s ease"
      >
        <span style={{ fontSize: '14px', flexShrink: 0, color: '#6B7280', lineHeight: '32px' }}>
          🔒
        </span>
        <Input
          ref={inputRef}
          value={displayValue}
          onChange={(e) => setUrlInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder="Search or enter URL"
          size="sm"
          variant="flushed"
          border="none"
          flex={1}
          minW={0}
          fontSize="sm"
          h="30px"
          color="gray.700"
          _placeholder={{ color: 'gray.400' }}
          _focus={{ boxShadow: 'none', border: 'none' }}
          aria-label="URL input"
          readOnly={readOnly}
          pointerEvents={readOnly ? 'none' : 'auto'}
        />
      </Flex>

      <HStack gap={1}>
        <IconButton
          aria-label="Info"
          disabled
          size="sm"
          borderRadius="full"
          variant="ghost"
          color="gray.600"
          opacity={0.5}
          cursor="not-allowed"
          _hover={{}}
        >
          <LuInfo />
        </IconButton>
      </HStack>
    </Flex>
  );
};
