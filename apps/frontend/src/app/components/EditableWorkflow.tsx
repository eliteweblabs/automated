'use client';

import { useState, useEffect } from 'react';
import {
  Box,
  VStack,
  Input,
  Textarea,
  Button,
  IconButton,
  Circle,
  Flex,
  Text,
  Spinner,
  Separator,
} from '@chakra-ui/react';
import { LuPlus, LuX } from 'react-icons/lu';
import { useOptionalAuth } from '../../providers/auth-provider';

interface WorkflowStep {
  stepNumber: number;
  description: string;
}

interface EditableWorkflowProps {
  initialTitle: string;
  initialText: string;
  initialSteps?: WorkflowStep[];
  onSave?: (title: string, steps: WorkflowStep[]) => Promise<void>;
  onDelete?: () => Promise<void>;
}

export function EditableWorkflow({
  initialTitle,
  initialText,
  initialSteps,
  onSave,
  onDelete,
}: EditableWorkflowProps) {
  const [title, setTitle] = useState(initialTitle);
  const [steps, setSteps] = useState<WorkflowStep[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const { isLoaded } = useOptionalAuth();

  // Parse steps from text on mount
  useEffect(() => {
    if (initialSteps && initialSteps.length > 0) {
      setSteps(initialSteps);
      return;
    }
    const parsed = parseStepsFromText(initialText);
    setSteps(parsed);
  }, [initialText, initialSteps]);

  const parseStepsFromText = (text: string): WorkflowStep[] => {
    const steps: WorkflowStep[] = [];
    const workflowMatch = text.match(/Workflow:([\s\S]*)/i);

    if (workflowMatch) {
      const workflowSection = workflowMatch[1];
      const stepRegex = /^\s*(\d+)\.\s*(.+)/gm;
      let match;

      while ((match = stepRegex.exec(workflowSection)) !== null) {
        steps.push({
          stepNumber: parseInt(match[1], 10),
          description: match[2].trim(),
        });
      }
    }

    return steps;
  };

  const handleSave = async () => {
    // Check if user is logged in
    if (!isLoaded) return;

    if (!onSave) return;

    setIsSaving(true);
    try {
      await onSave(title, steps);
    } catch (error) {
      console.error('Failed to save workflow:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;

    setIsDeleting(true);
    try {
      await onDelete();
    } catch (error) {
      console.error('Failed to delete workflow:', error);
    } finally {
      setIsDeleting(false);
    }
  };

  const updateStep = (stepNumber: number, description: string) => {
    setSteps((prev) => prev.map((s) => (s.stepNumber === stepNumber ? { ...s, description } : s)));
  };

  const addStep = (index?: number) => {
    setSteps((prev) => {
      const newSteps = [...prev];
      const insertIndex = typeof index === 'number' ? index : newSteps.length;

      newSteps.splice(insertIndex, 0, {
        stepNumber: 0, // Will re-index below
        description: '',
      });

      // Re-index all steps
      return newSteps.map((step, i) => ({
        ...step,
        stepNumber: i + 1,
      }));
    });
  };

  const deleteStep = (stepNumber: number) => {
    setSteps((prev) => {
      const filtered = prev.filter((s) => s.stepNumber !== stepNumber);
      // Re-index
      return filtered.map((step, i) => ({
        ...step,
        stepNumber: i + 1,
      }));
    });
  };

  return (
    <VStack gap={4} align="stretch" mt={6}>
      <Box>
        <Input
          type="text"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
          }}
          variant="flushed"
          borderBottom="2px solid"
          borderColor="gray.200"
          color="black"
          fontSize="3xl"
          fontWeight="bold"
          px={0}
          pb={4}
          pt={2}
          placeholder="Workflow title"
          _focus={{
            outline: 'none',
            borderColor: 'black',
          }}
          transition="all 0.2s"
        />
      </Box>

      <Box>
        <VStack gap={2} align="stretch">
          {steps.map((step, index) => (
            <Box key={index} className="group" role="group">
              <Flex
                position="relative"
                align="center"
                justify="center"
                opacity={0}
                _groupHover={{ opacity: 1 }}
                transition="opacity 0.2s"
                mb={1}
              >
                <IconButton
                  aria-label="Add step here"
                  onClick={() => addStep(index)}
                  position="relative"
                  zIndex={10}
                  size="xs"
                  borderRadius="full"
                  bg="white"
                  border="none"
                  color="gray.400"
                  shadow="sm"
                  _hover={{
                    transform: 'scale(1.1)',
                  }}
                  transition="all 0.2s"
                >
                  <LuPlus fontSize="xs" />
                </IconButton>
              </Flex>

              <Flex align="center" gap={4} p={2} transition="background-color 0.2s">
                <Circle
                  size="32px"
                  bg="gray.100"
                  color="gray.500"
                  fontSize="sm"
                  fontWeight="semibold"
                  mt={1}
                  flexShrink={0}
                >
                  {step.stepNumber}
                </Circle>
                <Textarea
                  value={step.description}
                  onChange={(e) => updateStep(step.stepNumber, e.target.value)}
                  flex={1}
                  px={4}
                  py={3}
                  bg="white"
                  border="none"
                  color="black"
                  rows={2}
                  placeholder="What happens in this step?"
                  shadow="xs"
                  _focus={{
                    outline: 'none',
                    borderColor: 'blackAlpha.100',
                  }}
                  transition="all 0.2s"
                />
                <IconButton
                  aria-label="Delete step"
                  onClick={() => deleteStep(step.stepNumber)}
                  flexShrink={0}
                  size="sm"
                  borderRadius="lg"
                  variant="ghost"
                  color="gray.300"
                  mt={1}
                  _hover={{
                    bg: 'red.50',
                    color: 'red.500',
                  }}
                  transition="colors 0.2s"
                >
                  <LuX fontSize="xs" />
                </IconButton>
              </Flex>

              {/* Add Step icon after the last step, visible when hovering over the last step */}
              {index === steps.length - 1 && (
                <Box position="relative" pt={2}>
                  <Flex
                    align="center"
                    justify="center"
                    opacity={0}
                    _groupHover={{ opacity: 1 }}
                    transition="opacity 0.2s"
                  >
                    <IconButton
                      aria-label="Add step at end"
                      onClick={() => addStep()}
                      size="xs"
                      borderRadius="full"
                      bg="white"
                      border="none"
                      color="gray.400"
                      shadow="sm"
                      _hover={{
                        transform: 'scale(1.1)',
                      }}
                      transition="all 0.2s"
                    >
                      <LuPlus fontSize="xs" />
                    </IconButton>
                  </Flex>
                </Box>
              )}
            </Box>
          ))}

          {/* Fallback Add Step for empty list */}
          {steps.length === 0 && (
            <Box position="relative" role="group" pt={2}>
              <Flex
                align="center"
                justify="center"
                opacity={0}
                _groupHover={{ opacity: 1 }}
                transition="opacity 0.2s"
              >
                <IconButton
                  aria-label="Add step at end"
                  onClick={() => addStep()}
                  size="xs"
                  borderRadius="full"
                  bg="white"
                  border="none"
                  color="gray.400"
                  shadow="sm"
                  _hover={{
                    transform: 'scale(1.1)',
                  }}
                  transition="all 0.2s"
                >
                  <LuPlus fontSize="xs" />
                </IconButton>
              </Flex>
            </Box>
          )}
        </VStack>

        <Box display="flex" justifyContent="flex-end" alignItems="center" mt={2} mb={6} gap={3}>
          <Button onClick={handleSave} loading={isSaving} variant="solid" size="lg">
            Save Workflow
          </Button>

          <Button
            onClick={handleDelete}
            loading={isDeleting}
            variant="outline"
            size="lg"
            colorScheme="red"
            borderColor="red.200"
            color="red.500"
            _hover={{ bg: 'red.50' }}
          >
            Delete Workflow
          </Button>
        </Box>
      </Box>
    </VStack>
  );
}
