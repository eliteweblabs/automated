import { Box, Button, Flex, IconButton, Spinner, Text } from '@chakra-ui/react';
import { LuPlus, LuX } from 'react-icons/lu';
import { RiFileExcel2Fill } from 'react-icons/ri';

interface Page {
  id: string;
  title?: string;
  url?: string;
  favicon?: string;
  isSkeleton?: boolean;
}

interface BrowserTabsProps {
  pages: Page[];
  activePageIndex: number;
  setActivePageIndex: (index: number) => void;
  handleAddTab: () => void;
  handleCloseTab: (e: React.MouseEvent, pageId: string) => void;
  refreshPages: (sessionId: string) => void;
  sessionId: string | null;
  isAddingTab: boolean;
  onExcelOpen: () => void;
  isExcelMode: boolean;
  readOnly?: boolean;
}

export const BrowserTabs = ({
  pages,
  activePageIndex,
  setActivePageIndex,
  handleAddTab,
  handleCloseTab,
  refreshPages,
  sessionId,
  isAddingTab,
  onExcelOpen,
  isExcelMode,
  readOnly,
}: BrowserTabsProps) => {
  return (
    <Flex
      align="center"
      gap={0}
      bg="#DEE1E6"
      pt={2}
      px={2}
      borderBottom="1px solid"
      borderColor="#CACDD1"
      width="full"
    >
      {pages.length > 0 ? (
        pages.map((page, index) => {
          const isActive = activePageIndex === index && !isExcelMode;
          return (
            <Box
              key={page.id}
              onClick={() => setActivePageIndex(index)}
              position="relative"
              px={4}
              py={2}
              borderTopRadius="sm"
              cursor="pointer"
              fontSize="xs"
              w="180px"
              display="flex"
              alignItems="center"
              gap={2}
              role="group"
              transition="all 0.2s"
              bg={isActive ? 'white' : 'transparent'}
              color={isActive ? '#3C4043' : '#5F6368'}
              fontWeight={isActive ? 'medium' : 'normal'}
              zIndex={isActive ? 10 : 'auto'}
              _hover={!isActive ? { bg: '#EBEEF1' } : {}}
              _before={
                isActive
                  ? {
                    content: '""',
                    position: 'absolute',
                    bottom: '-1px',
                    left: 0,
                    right: 0,
                    height: '1px',
                    bg: 'white',
                  }
                  : {}
              }
            >
              {activePageIndex !== index && index !== 0 && activePageIndex !== index - 1 && (
                <Box
                  position="absolute"
                  left={0}
                  top="50%"
                  transform="translateY(-50%)"
                  width="1px"
                  height="16px"
                  bg="#8B9196"
                />
              )}
              <Box width="14px" height="14px" flexShrink={0} display="flex" alignItems="center" justifyContent="center">
                {page.favicon ? (
                  <img
                    src={page.favicon}
                    alt=""
                    width={14}
                    height={14}
                    style={{ objectFit: 'contain' }}
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).nextElementSibling && ((e.target as HTMLImageElement).parentElement!.querySelector('span')!.style.display = 'inline'); }}
                  />
                ) : page.title === 'Loading...' ? (
                  <Spinner size="xs" color="#5F6368" width="10px" height="10px" borderWidth="1.5px" />
                ) : null}
                <Text fontSize="10px" as="span" style={{ display: page.favicon || page.title === 'Loading...' ? 'none' : 'inline' }}>🌐</Text>
              </Box>
              <Text
                flex={1}
                minW={0}
                overflow="hidden"
                textOverflow="ellipsis"
                whiteSpace="nowrap"
              >
                {page.isSkeleton || page.url === "about.blank" ? 'Google' : (page.title || 'New Tab')}
              </Text>
              {!page.isSkeleton && !readOnly && (
                <IconButton
                  aria-label="Close tab"
                  onClick={(e) => handleCloseTab(e, page.id)}
                  size="xs"
                  borderRadius="full"
                  variant="ghost"
                  minW="16px"
                  height="16px"

                >
                  <LuX size={10} />
                </IconButton>
              )}
            </Box>
          );
        })
      ) : (
        <Box
          position="relative"
          px={4}
          py={2}
          borderTopRadius="sm"
          bg="white"
          color="#3C4043"
          fontWeight="medium"
          fontSize="xs"
          w="180px"
          display="flex"
          alignItems="center"
          gap={2}
          zIndex={10}
          _before={{
            content: '""',
            position: 'absolute',
            bottom: '-1px',
            left: 0,
            right: 0,
            height: '1px',
            bg: 'white',
          }}
        >
          <Box width="14px" height="14px" flexShrink={0}>
            <Text fontSize="10px">🌐</Text>
          </Box>
          <Text
            flex={1}
            minW={0}
            overflow="hidden"
            textOverflow="ellipsis"
            whiteSpace="nowrap"
          >
            Google
          </Text>
        </Box>
      )}
      {!readOnly && (
        <IconButton
          aria-label="New Tab"
          onClick={handleAddTab}
          disabled={isAddingTab || !sessionId}
          size="sm"
          width="28px"
          height="28px"
          variant="ghost"
          color="#5F6368"
          ml={1}
          mb={1}
          opacity={isAddingTab || !sessionId ? 0.5 : 1}
          cursor={isAddingTab || !sessionId ? 'not-allowed' : 'pointer'}
          _hover={{ bg: '#D0D3D7' }}
          transition="all 0.2s"
        >
          <LuPlus size={15} />
        </IconButton>
      )}
      <Box flex={1} />
      {/* <Button
        size="xs"
        variant="ghost"
        onClick={onExcelOpen}
        mb={1}
        color={isExcelMode ? '#1D6F42' : '#5F6368'}
        fontWeight={isExcelMode ? 'semibold' : 'normal'}
        _hover={{ bg: isExcelMode ? '#E8F0FE' : '#D0D3D7' }}
        bg={isExcelMode ? 'white' : 'transparent'}
        borderTopRadius="sm"
        height="32px"
        px={4}
        display="flex"
        alignItems="center"
        gap={1}
        position="relative"
      >
        <RiFileExcel2Fill color="#1D6F42" />
        Excel
      </Button> */}
    </Flex>
  );
};
