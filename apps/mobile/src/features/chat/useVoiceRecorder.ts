// Recording a voice note (spec 1.5, 2.12): tap to start, tap to stop and send. Phones record m4a
// (AAC in MP4); a browser records WebM or Ogg, which the API accepts for voice notes too.
import { useCallback, useEffect, useRef, useState } from 'react';
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder } from 'expo-audio';
import { MEDIA_LIMITS } from '@njangi/shared/contracts/media';
import type { PickedFile } from './useAttachments';
import { voiceMime } from './media';

export type RecorderPhase = 'idle' | 'recording' | 'ready';
export type StartResult = 'started' | 'denied' | 'failed';

/** Shorter than this is a mis-tap, not a message. */
export const MIN_VOICE_SECONDS = 1;
const MAX_SECONDS = MEDIA_LIMITS.VOICE.maxDurationSec;

export function useVoiceRecorder() {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [phase, setPhase] = useState<RecorderPhase>('idle');
  const [seconds, setSeconds] = useState(0);
  const startedAt = useRef(0);
  const ready = useRef<PickedFile | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimer = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };

  /** Stops the recorder and returns the recorded file, or null when nothing usable came out. */
  const finishRecording = useCallback(async (): Promise<PickedFile | null> => {
    clearTimer();
    const elapsed = Math.max(0, (Date.now() - startedAt.current) / 1000);
    try {
      await recorder.stop();
    } catch {
      return null;
    }
    const uri = recorder.uri;
    if (!uri) return null;
    let type = '';
    try {
      type = (await (await fetch(uri)).blob()).type;
    } catch {
      // Keep the phone default.
    }
    return {
      uri,
      kind: 'VOICE',
      mime: voiceMime(type),
      durationSec: Math.min(MAX_SECONDS, Math.max(1, Math.round(elapsed))),
    };
  }, [recorder]);

  const start = useCallback(async (): Promise<StartResult> => {
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) return 'denied';
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch (error) {
      const denied = error instanceof Error && /denied|NotAllowed|permission/i.test(error.message);
      return denied ? 'denied' : 'failed';
    }
    startedAt.current = Date.now();
    ready.current = null;
    setSeconds(0);
    setPhase('recording');
    timer.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt.current) / 1000);
      setSeconds(elapsed);
      if (elapsed >= MAX_SECONDS) {
        // The limit is reached: stop, and keep the note ready to send.
        void finishRecording().then((file) => {
          ready.current = file;
          setPhase(file ? 'ready' : 'idle');
        });
      }
    }, 250);
    return 'started';
  }, [finishRecording, recorder]);

  /** Stops and returns the note, or null when it is too short. The caller sends it. */
  const stop = useCallback(async (): Promise<{ file: PickedFile | null; tooShort: boolean }> => {
    const file = phase === 'ready' ? ready.current : await finishRecording();
    ready.current = null;
    setPhase('idle');
    setSeconds(0);
    if (!file || (file.durationSec ?? 0) < MIN_VOICE_SECONDS) return { file: null, tooShort: true };
    return { file, tooShort: false };
  }, [finishRecording, phase]);

  const cancel = useCallback(async () => {
    clearTimer();
    ready.current = null;
    if (phase === 'recording') {
      try {
        await recorder.stop();
      } catch {
        // Nothing to release.
      }
    }
    setPhase('idle');
    setSeconds(0);
  }, [phase, recorder]);

  // Leaving the screen while recording releases the microphone.
  useEffect(
    () => () => {
      clearTimer();
      if (recorder.isRecording) void recorder.stop().catch(() => undefined);
    },
    [recorder],
  );

  return { phase, seconds, start, stop, cancel, maxSeconds: MAX_SECONDS };
}
