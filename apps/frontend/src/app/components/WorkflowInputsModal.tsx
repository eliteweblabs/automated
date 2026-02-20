'use client';

import { useState, useEffect } from 'react';
import { VStack, Text, Textarea, Button } from '@chakra-ui/react';
import { AppModal } from './AppModal';

interface WorkflowInputsModalProps {
  isOpen: boolean;
  onClose: () => void;
  workflowTitle: string;
  inputs: string[];
  onSubmit: (inputValues: Record<string, string>) => void;
  isSubmitting?: boolean;
}

export function WorkflowInputsModal({
  isOpen,
  onClose,
  workflowTitle,
  inputs,
  onSubmit,
  isSubmitting,
}: WorkflowInputsModalProps) {
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    if (isOpen) {
      const initial: Record<string, string> = {};
      for (const input of inputs) {
        initial[input] = '';
      }
      setValues(initial);
    }
  }, [isOpen, inputs]);

  const handleSubmit = () => {
    onSubmit(values);
  };

  return (
    <AppModal
      isOpen={isOpen}
      onClose={onClose}
      title={`Start: ${workflowTitle}`}
      size="lg"
      footer={
        <>
          <Button
            size="sm"
            variant="outline"
            borderColor="app.border"
            color="app.snow"
            _hover={{ bg: 'appSurface', borderColor: 'app.border' }}
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            bg="app.primary"
            color="app.onPrimary"
            _hover={{ bg: 'app.primaryAlt' }}
            onClick={handleSubmit}
            loading={isSubmitting}
          >
            Start Workflow
          </Button>
        </>
      }
    >
      <VStack align="stretch" gap={4}>
        <Text color="app.muted" fontSize="sm">
          Provide the required inputs for this workflow run.
        </Text>

        {inputs.map((inputName) => (
          <VStack key={inputName} align="stretch" gap={1}>
            <Text fontSize="sm" fontWeight="medium" color="app.snow">
              {inputName}
            </Text>
            <Textarea
              placeholder={`Enter ${inputName}...`}
              value={values[inputName] ?? ''}
              onChange={(e) =>
                setValues((prev) => ({ ...prev, [inputName]: e.target.value }))
              }
              bg="app.bg"
              borderColor="app.border"
              color="app.snow"
              _placeholder={{ color: 'app.muted' }}
              rows={2}
              resize="vertical"
            />
          </VStack>
        ))}
      </VStack>
    </AppModal>
  );
}
