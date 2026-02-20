'use client';

import { useEffect, useMemo, useState } from 'react';
import { Box, Button, HStack, Input, Text, VStack } from '@chakra-ui/react';
import type { UpsertWorkflowScheduleRequest } from '@automated/api-dtos';
import {
  useDeleteWorkflowSchedule,
  useUpsertWorkflowSchedule,
  useWorkflowSchedule,
} from '../../hooks/api';
import { AppModal } from './AppModal';

const DAY_OPTIONS = [
  { value: 1, label: 'Mo' },
  { value: 2, label: 'Tu' },
  { value: 3, label: 'We' },
  { value: 4, label: 'Th' },
  { value: 5, label: 'Fr' },
  { value: 6, label: 'Sa' },
  { value: 0, label: 'Su' },
];

interface WorkflowScheduleModalProps {
  isOpen: boolean;
  workflowId: string | null;
  workflowTitle: string | null;
  hasExistingSchedule: boolean;
  onClose: () => void;
}

export function WorkflowScheduleModal(props: WorkflowScheduleModalProps) {
  const { isOpen, workflowId, workflowTitle, hasExistingSchedule, onClose } = props;
  const localTimezone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);
  const scheduleQuery = useWorkflowSchedule(isOpen && workflowId ? workflowId : null);
  const upsertSchedule = useUpsertWorkflowSchedule();
  const deleteSchedule = useDeleteWorkflowSchedule();

  const [type, setType] = useState<'daily' | 'interval'>('daily');
  const [dailyTime, setDailyTime] = useState('09:00');
  const [dailyDays, setDailyDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [intervalMinutes, setIntervalMinutes] = useState(60);
  const [timezone, setTimezone] = useState(localTimezone);
  const [error, setError] = useState<string | null>(null);

  const timezoneShortLabel = useMemo(() => {
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        timeZoneName: 'short',
      }).formatToParts(new Date());
      return parts.find((part) => part.type === 'timeZoneName')?.value ?? timezone;
    } catch {
      return timezone;
    }
  }, [timezone]);

  useEffect(() => {
    if (!isOpen) return;

    if (!scheduleQuery.data) {
      setType('daily');
      setDailyTime('09:00');
      setDailyDays([1, 2, 3, 4, 5]);
      setIntervalMinutes(60);
      setTimezone(localTimezone);
      setError(null);
      return;
    }

    const schedule = scheduleQuery.data;
    setType(schedule.type);
    setTimezone(schedule.timezone || localTimezone);
    setDailyTime(schedule.dailyTime ?? '09:00');
    setDailyDays(schedule.dailyDays.length > 0 ? schedule.dailyDays : [1, 2, 3, 4, 5]);
    setIntervalMinutes(schedule.intervalMinutes ?? 60);
    setError(null);
  }, [isOpen, localTimezone, scheduleQuery.data]);

  const toggleDay = (day: number) => {
    setDailyDays((prev) => {
      if (prev.includes(day)) {
        return prev.filter((value) => value !== day);
      }
      return [...prev, day].sort((a, b) => a - b);
    });
  };

  const handleSave = () => {
    if (!workflowId) return;

    let payload: UpsertWorkflowScheduleRequest;
    if (type === 'daily') {
      if (dailyDays.length === 0) {
        setError('Pick at least one day for daily schedule.');
        return;
      }
      payload = {
        type: 'daily',
        timezone,
        daily: {
          time: dailyTime,
          days: dailyDays,
        },
      };
    } else {
      if (!Number.isFinite(intervalMinutes) || intervalMinutes < 5) {
        setError('Interval must be at least 5 minutes.');
        return;
      }
      payload = {
        type: 'interval',
        timezone,
        interval: {
          everyMinutes: Math.floor(intervalMinutes),
        },
      };
    }

    setError(null);
    upsertSchedule.mutate(
      { workflowId, payload },
      {
        onSuccess: () => onClose(),
        onError: (mutationError) => {
          const message =
            (mutationError as any)?.response?.data?.message ||
            (mutationError as Error)?.message ||
            'Failed to save schedule.';
          setError(message);
        },
      },
    );
  };

  const handleRemoveSchedule = () => {
    if (!workflowId) return;
    setError(null);
    deleteSchedule.mutate(workflowId, {
      onSuccess: () => onClose(),
      onError: (mutationError) => {
        const message =
          (mutationError as any)?.response?.data?.message ||
          (mutationError as Error)?.message ||
          'Failed to remove schedule.';
        setError(message);
      },
    });
  };

  const nextRunLabel = scheduleQuery.data?.nextRunAt
    ? new Date(scheduleQuery.data.nextRunAt).toLocaleString(undefined, {
        timeZone: timezone,
        timeZoneName: 'short',
      })
    : 'Not scheduled yet';
  const isUpdateMode = hasExistingSchedule || Boolean(scheduleQuery.data);

  return (
    <AppModal
      isOpen={isOpen}
      onClose={onClose}
      title={isUpdateMode ? 'Update Schedule' : 'Create Schedule'}
      size="lg"
      footer={
        <HStack>
          {isUpdateMode && (
            <Button
              colorPalette="red"
              variant="outline"
              onClick={handleRemoveSchedule}
              loading={deleteSchedule.isPending}
            >
              Remove Schedule
            </Button>
          )}
          <Button
            variant="outline"
            color="app.snow"
            borderColor="app.border"
            _hover={{ bg: 'appSurface', borderColor: 'app.border' }}
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            bg="app.primary"
            color="app.onPrimary"
            _hover={{ bg: 'app.primaryAlt' }}
            onClick={handleSave}
            loading={upsertSchedule.isPending}
          >
            {isUpdateMode ? 'Update Schedule' : 'Create Schedule'}
          </Button>
        </HStack>
      }
    >
      <VStack align="stretch" gap={5}>
        <Text color="app.muted" fontSize="sm">
          Run{' '}
          <Text as="span" fontWeight="semibold" color="app.snow">
            {workflowTitle ?? 'this workflow'}
          </Text>{' '}
          automatically.
        </Text>

        <HStack p={1} w="fit-content" border="1px solid" borderColor="app.border">
          <Button
            size="sm"
            bg={type === 'daily' ? 'app.primary' : 'transparent'}
            color={type === 'daily' ? 'app.onPrimary' : 'app.muted'}
            _hover={{ bg: type === 'daily' ? 'app.primaryAlt' : 'appSurface' }}
            onClick={() => setType('daily')}
          >
            Daily
          </Button>
          <Button
            size="sm"
            bg={type === 'interval' ? 'app.primary' : 'transparent'}
            color={type === 'interval' ? 'app.onPrimary' : 'app.muted'}
            _hover={{ bg: type === 'interval' ? 'app.primaryAlt' : 'appSurface' }}
            onClick={() => setType('interval')}
          >
            Interval
          </Button>
        </HStack>

        {type === 'daily' ? (
          <VStack align="stretch" gap={4}>
            <Box>
              <Text fontSize="sm" color="app.muted" mb={2}>
                Time ({timezoneShortLabel})
              </Text>
              <Input
                type="time"
                value={dailyTime}
                onChange={(e) => setDailyTime(e.target.value)}
                maxW="220px"
                size="lg"
              />
            </Box>

            <Box>
              <Text fontSize="sm" color="app.muted" mb={2}>
                Days
              </Text>
              <HStack gap={2} flexWrap="wrap">
                {DAY_OPTIONS.map((day) => {
                  const selected = dailyDays.includes(day.value);
                  return (
                    <Button
                      key={day.value}
                      size="sm"
                      minW="42px"
                      bg={selected ? 'app.primary' : 'app.muted'}
                      _hover={{ bg: selected ? 'app.primaryAlt' : 'appSurface' }}
                      onClick={() => toggleDay(day.value)}
                    >
                      {day.label}
                    </Button>
                  );
                })}
              </HStack>
            </Box>
          </VStack>
        ) : (
          <VStack align="stretch" gap={3}>
            <Text fontSize="sm" color="app.muted">
              Run every N minutes
            </Text>
            <Input
              type="number"
              min={5}
              step={5}
              value={intervalMinutes}
              onChange={(e) => setIntervalMinutes(Number(e.target.value))}
              maxW="220px"
              size="lg"
            />
          </VStack>
        )}

        <Box>
          <Text fontSize="md" color="app.muted" mb={1}>
            Next run
          </Text>
          <Text fontSize="md" color="app.snow">
            {nextRunLabel}
          </Text>
        </Box>

        {error && (
          <Text fontSize="sm" color="red.300">
            {error}
          </Text>
        )}
      </VStack>
    </AppModal>
  );
}
