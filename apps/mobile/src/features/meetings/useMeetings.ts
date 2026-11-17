// Meetings (spec 2.7 Meetings, R15). Check-in, excuses and agenda items act directly; the admin's
// changes (schedule, attendance, close, cancel, minutes) come back as cards the admin confirms.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  attendanceListSchema,
  meetingListSchema,
  meetingResponseSchema,
  minutesDraftResponseSchema,
  minutesListSchema,
  type DraftMinutesRequest,
  type ExcuseRequest,
  type MarkAttendanceRequest,
  type PublishMinutesRequest,
  type ScheduleMeetingRequest,
} from '@njangi/shared/contracts/meetings';
import { pendingActionCreatedSchema } from '@njangi/shared/contracts/pending-actions';
import { api } from '@/api/client';

export const meetingKeys = {
  list: (groupId: string) => ['group', groupId, 'meetings'] as const,
  one: (meetingId: string) => ['meeting', meetingId] as const,
  attendance: (meetingId: string) => ['meeting', meetingId, 'attendance'] as const,
  minutes: (meetingId: string) => ['meeting', meetingId, 'minutes'] as const,
};

export function useMeetings(groupId: string | null, when: 'upcoming' | 'past') {
  return useQuery({
    queryKey: [...meetingKeys.list(groupId ?? 'none'), when],
    enabled: !!groupId,
    queryFn: async () =>
      (
        await api.get(`/v1/groups/${groupId}/meetings?when=${when}&limit=20`, {
          schema: meetingListSchema,
        })
      ).meetings,
  });
}

export function useMeeting(meetingId: string | null) {
  return useQuery({
    queryKey: meetingKeys.one(meetingId ?? 'none'),
    enabled: !!meetingId,
    queryFn: async () =>
      (await api.get(`/v1/meetings/${meetingId}`, { schema: meetingResponseSchema })).meeting,
  });
}

export function useAttendance(meetingId: string | null, enabled = true) {
  return useQuery({
    queryKey: meetingKeys.attendance(meetingId ?? 'none'),
    enabled: enabled && !!meetingId,
    queryFn: async () =>
      (await api.get(`/v1/meetings/${meetingId}/attendance`, { schema: attendanceListSchema }))
        .attendance,
  });
}

export function useMinutes(meetingId: string | null) {
  return useQuery({
    queryKey: meetingKeys.minutes(meetingId ?? 'none'),
    enabled: !!meetingId,
    queryFn: () => api.get(`/v1/meetings/${meetingId}/minutes`, { schema: minutesListSchema }),
  });
}

/** Refreshes the meeting list and the open meeting after any change to them. */
export function useRefreshMeetings(groupId: string | null, meetingId: string | null) {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: meetingKeys.list(groupId ?? 'none') });
    if (meetingId) {
      void qc.invalidateQueries({ queryKey: meetingKeys.one(meetingId) });
      void qc.invalidateQueries({ queryKey: meetingKeys.attendance(meetingId) });
      void qc.invalidateQueries({ queryKey: meetingKeys.minutes(meetingId) });
    }
  };
}

export function useScheduleMeeting(groupId: string | null) {
  return useMutation({
    mutationFn: async (body: ScheduleMeetingRequest) =>
      (
        await api.post(`/v1/groups/${groupId}/meetings`, body, {
          schema: pendingActionCreatedSchema,
        })
      ).action,
  });
}

/** A member's own check-in: acts directly (R15.3), returns the updated meeting. */
export function useCheckIn(meetingId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      (await api.post(`/v1/meetings/${meetingId}/check-in`, {}, { schema: meetingResponseSchema }))
        .meeting,
    onSuccess: (meeting) => qc.setQueryData(meetingKeys.one(meetingId ?? 'none'), meeting),
  });
}

export function useSendExcuse(meetingId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: ExcuseRequest) =>
      (await api.post(`/v1/meetings/${meetingId}/excuse`, body, { schema: meetingResponseSchema }))
        .meeting,
    onSuccess: (meeting) => qc.setQueryData(meetingKeys.one(meetingId ?? 'none'), meeting),
  });
}

export function useAddAgendaItem(meetingId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (text: string) =>
      (
        await api.post(
          `/v1/meetings/${meetingId}/agenda-items`,
          { text },
          { schema: meetingResponseSchema },
        )
      ).meeting,
    onSuccess: (meeting) => qc.setQueryData(meetingKeys.one(meetingId ?? 'none'), meeting),
  });
}

export function useMarkAttendance(meetingId: string | null) {
  return useMutation({
    mutationFn: async (body: MarkAttendanceRequest) =>
      (
        await api.put(`/v1/meetings/${meetingId}/attendance`, body, {
          schema: pendingActionCreatedSchema,
        })
      ).action,
  });
}

/** The admin's card to close or cancel the meeting. */
export function useMeetingAdminAction(meetingId: string | null) {
  return useMutation({
    mutationFn: async (kind: 'close' | 'cancel') =>
      (
        await api.post(
          `/v1/meetings/${meetingId}/${kind}`,
          {},
          {
            schema: pendingActionCreatedSchema,
          },
        )
      ).action,
  });
}

/** A draft for the admin, written by Njangi from the notes (nothing is published). */
export function useDraftMinutes(meetingId: string | null) {
  return useMutation({
    mutationFn: async (body: DraftMinutesRequest) =>
      (
        await api.post(`/v1/meetings/${meetingId}/minutes/draft`, body, {
          schema: minutesDraftResponseSchema,
        })
      ).draft,
  });
}

export function usePublishMinutes(meetingId: string | null) {
  return useMutation({
    mutationFn: async (body: PublishMinutesRequest) =>
      (
        await api.post(`/v1/meetings/${meetingId}/minutes/publish`, body, {
          schema: pendingActionCreatedSchema,
        })
      ).action,
  });
}
