import { describe, it, expect, vi } from 'vitest';
import type { UnknownAction } from '@reduxjs/toolkit';
import type { OpenLinkDevice, OpenLinkStatus } from '~/modules/openlink';
import { applyOpenLinkEffects } from '@/store/open-link/effects';
import {
  openLinkDevicesChanged,
  openLinkReducer,
  watchRecordingRequested,
  watchRecordingStateChanged,
  selectWatchRecorded,
} from '@/store/open-link';
import { activeSessionUpdated } from '@/store/workout-worker';
import { setIsHydrated, setRecordWorkoutsOnWatch } from '@/store/settings';
import { RootState } from '@/store/store';
import { createAddEffectTestBed } from '@/utils/__test__/add-effect-testbed';
import { EmptySession, Session } from '@/models/session-models';

const connected: OpenLinkStatus = {
  kind: 'connected',
  protocolVersion: 2,
  trust: 'TRUSTED',
  grantedCapabilities: ['recording', 'devices', 'profile'],
  canOpenConsent: false,
};

const watch: OpenLinkDevice = {
  id: 'w1',
  displayName: 'Watch',
  kind: 'WATCH',
  connection: 'CONNECTED',
  batteryPercent: 80,
  supportsRecording: true,
  recordingFeatures: ['HEART_RATE', 'PAUSE'],
  exerciseTypes: [81],
};

function session(): Session {
  return EmptySession.with({ id: 'session-1' });
}

function testBed(options: {
  enabled?: boolean;
  status?: OpenLinkStatus;
  devices?: OpenLinkDevice[];
  active?: Session;
  recordings?: RootState['openLink']['recordings'];
}) {
  const active = options.active;
  const openLinkService = {
    start: vi.fn(),
    stop: vi.fn(),
    startRecording: vi.fn(),
    stopRecording: vi.fn(),
    setBodyWeight: vi.fn(),
  };
  const bed = createAddEffectTestBed({
    initialState: {
      settings: { isHydrated: true, recordWorkoutsOnWatch: options.enabled ?? true },
      openLink: {
        status: options.status ?? connected,
        devices: options.devices ?? [watch],
        recordings: options.recordings ?? {},
      },
      storedSessions: {
        openSessions: active ? { [active.id]: active } : {},
        activeSessionId: active?.id,
      },
    },
    services: { openLinkService },
    // Only the open-link slice moves; the rest is the fixture as given.
    reducer: (state: Partial<RootState> = {}, action: UnknownAction) => ({
      ...state,
      openLink: openLinkReducer(state.openLink, action),
    }),
  });
  applyOpenLinkEffects(bed.addEffect);
  return { bed, openLinkService };
}

describe('open-link effects', () => {
  it('connects only while recording on the watch is switched on', async () => {
    const on = testBed({ enabled: true });
    await on.bed.dispatchHandled(setIsHydrated(true));
    expect(on.openLinkService.start).toHaveBeenCalled();

    const off = testBed({ enabled: false });
    await off.bed.dispatchHandled(setRecordWorkoutsOnWatch(false));
    expect(off.openLinkService.stop).toHaveBeenCalled();
    expect(off.openLinkService.start).not.toHaveBeenCalled();
  });

  it('starts a recorded workout on the watch when a LiftLog workout begins', async () => {
    const active = session();
    const { bed, openLinkService } = testBed({ active });

    await bed.dispatchHandled(activeSessionUpdated({ before: undefined, after: active }));

    expect(openLinkService.startRecording).toHaveBeenCalledWith(active.id, 'w1', 81, expect.any(Number));
    expect(bed.dispatchedActions).toContainEqual(watchRecordingRequested({ sessionId: active.id, deviceId: 'w1' }));
  });

  it('asks only once for a workout', async () => {
    const active = session();
    const { bed, openLinkService } = testBed({
      active,
      recordings: { [active.id]: { deviceId: 'w1', state: undefined, ran: false } },
    });

    await bed.dispatchHandled(activeSessionUpdated({ before: active, after: active }));

    expect(openLinkService.startRecording).not.toHaveBeenCalled();
  });

  it('waits for a watch that can record a gym workout', async () => {
    const active = session();
    const { bed, openLinkService } = testBed({ active, devices: [{ ...watch, exerciseTypes: [56] }] });

    await bed.dispatchHandled(activeSessionUpdated({ before: undefined, after: active }));
    expect(openLinkService.startRecording).not.toHaveBeenCalled();

    await bed.dispatchHandled(openLinkDevicesChanged([watch]));
    expect(openLinkService.startRecording).toHaveBeenCalledTimes(1);
  });

  it('sends nothing to a host that speaks version 1, or without the setting', async () => {
    const active = session();
    const v1 = testBed({ active, status: { ...connected, protocolVersion: 1 } });
    await v1.bed.dispatchHandled(activeSessionUpdated({ before: undefined, after: active }));
    expect(v1.openLinkService.startRecording).not.toHaveBeenCalled();

    const off = testBed({ active, enabled: false });
    await off.bed.dispatchHandled(activeSessionUpdated({ before: undefined, after: active }));
    expect(off.openLinkService.startRecording).not.toHaveBeenCalled();
  });

  it('stops the watch when the workout ends', async () => {
    const before = session();
    const { bed, openLinkService } = testBed({
      recordings: { [before.id]: { deviceId: 'w1', state: undefined, ran: true } },
    });

    await bed.dispatchHandled(activeSessionUpdated({ before, after: undefined }));

    expect(openLinkService.stopRecording).toHaveBeenCalledWith(before.id);
  });
});

describe('open-link slice', () => {
  const requested = openLinkReducer(undefined, watchRecordingRequested({ sessionId: 's', deviceId: 'w1' }));
  const report = (phase: 'RECORDING' | 'FAILED' | 'STOPPED') =>
    watchRecordingStateChanged({ sessionId: 's', deviceId: 'w1', phase, reason: null, atMillis: 1, summary: null });

  it("counts a workout as the watch's once the watch recorded it", () => {
    const recorded = [report('RECORDING'), report('STOPPED')].reduce(openLinkReducer, requested);
    expect(selectWatchRecorded({ openLink: recorded }, 's')).toBe(true);
  });

  it('leaves a workout the watch refused to LiftLog', () => {
    const refused = openLinkReducer(requested, report('FAILED'));
    expect(selectWatchRecorded({ openLink: refused }, 's')).toBe(false);
  });
});
