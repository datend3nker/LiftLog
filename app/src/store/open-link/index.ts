import type { OpenLinkDevice, OpenLinkRecordingState, OpenLinkStatus } from '~/modules/openlink';
import { createSlice, PayloadAction } from '@reduxjs/toolkit';

/** A workout of LiftLog's that a watch records through OpenLink. */
export interface WatchRecording {
  deviceId: string;
  /** The last state the host reported; undefined until it has. */
  state: OpenLinkRecordingState | undefined;
  /** The host reported the watch recording or paused at least once: the watch measured it. */
  ran: boolean;
}

export interface OpenLinkState {
  /** OpenWatch is installed; read once at startup, so state-only readers like What's New can tell. */
  hostInstalled: boolean;
  status: OpenLinkStatus;
  devices: OpenLinkDevice[];
  /** By LiftLog session id, which is also the OpenLink session id. */
  recordings: Record<string, WatchRecording>;
}

const initialState: OpenLinkState = {
  hostInstalled: false,
  status: { kind: 'stopped' },
  devices: [],
  recordings: {},
};

/** Health Connect's exercise types for a gym workout, the one LiftLog writes itself first. */
export const STRENGTH_EXERCISE_TYPES = [81, 70] as const;

const openLinkSlice = createSlice({
  name: 'openLink',
  initialState,
  reducers: {
    openLinkHostInstalled(state, action: PayloadAction<boolean>) {
      state.hostInstalled = action.payload;
    },
    openLinkStatusChanged(state, action: PayloadAction<OpenLinkStatus>) {
      state.status = action.payload;
    },
    openLinkDevicesChanged(state, action: PayloadAction<OpenLinkDevice[]>) {
      state.devices = action.payload;
    },
    watchRecordingRequested(state, action: PayloadAction<{ sessionId: string; deviceId: string }>) {
      state.recordings[action.payload.sessionId] ??= {
        deviceId: action.payload.deviceId,
        state: undefined,
        ran: false,
      };
    },
    watchRecordingStateChanged(state, action: PayloadAction<OpenLinkRecordingState>) {
      const reported = action.payload;
      const recording = state.recordings[reported.sessionId];
      if (!recording) {
        return;
      }
      recording.state = reported;
      recording.ran ||= reported.phase === 'RECORDING' || reported.phase === 'PAUSED';
    },
  },
  selectors: {
    selectOpenLinkStatus: (state) => state.status,
    selectWatchRecording: (state, sessionId: string): WatchRecording | undefined => state.recordings[sessionId],
    selectWatchRecorded: (state, sessionId: string) => state.recordings[sessionId]?.ran ?? false,
  },
});

export const openLinkReducer = openLinkSlice.reducer;

export const {
  openLinkHostInstalled,
  openLinkStatusChanged,
  openLinkDevicesChanged,
  watchRecordingRequested,
  watchRecordingStateChanged,
} = openLinkSlice.actions;

export const { selectOpenLinkStatus, selectWatchRecording, selectWatchRecorded } = openLinkSlice.selectors;

/** Connected, trusted with recording, and speaking the version that lets a watch record. */
export function canRecordOnWatch(status: OpenLinkStatus): boolean {
  return status.kind === 'connected' && status.protocolVersion >= 2 && status.grantedCapabilities.includes('recording');
}

/** The watch to record a gym workout on: connected, and able to record one itself. */
export function pickRecordingDevice(devices: OpenLinkDevice[]): OpenLinkDevice | undefined {
  return devices.find(
    (device) =>
      device.supportsRecording &&
      device.connection === 'CONNECTED' &&
      device.exerciseTypes.some((type) => (STRENGTH_EXERCISE_TYPES as readonly number[]).includes(type)),
  );
}

export function strengthExerciseTypeFor(device: OpenLinkDevice): number {
  return STRENGTH_EXERCISE_TYPES.find((type) => device.exerciseTypes.includes(type)) ?? STRENGTH_EXERCISE_TYPES[0];
}
