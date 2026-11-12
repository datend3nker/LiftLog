import { RootState } from '@/store';
import {
  canRecordOnWatch,
  openLinkDevicesChanged,
  openLinkStatusChanged,
  pickRecordingDevice,
  strengthExerciseTypeFor,
  watchRecordingRequested,
} from '@/store/open-link';
import { setIsHydrated, setRecordWorkoutsOnWatch } from '@/store/settings';
import { selectActiveSession, selectSession, sessionFinished } from '@/store/stored-sessions';
import { AddEffectFn, AppDispatch } from '@/store/store';
import { activeSessionUpdated } from '@/store/workout-worker';
import { OpenLinkService } from '@/services/open-link-service';

export function applyOpenLinkEffects(addEffect: AddEffectFn) {
  addEffect([setIsHydrated, setRecordWorkoutsOnWatch], (_, { getState, extra: { openLinkService } }) => {
    const { isHydrated, recordWorkoutsOnWatch } = getState().settings;
    if (isHydrated && recordWorkoutsOnWatch) {
      openLinkService.start();
    } else {
      openLinkService.stop();
    }
  });

  // The watch starts with LiftLog's workout, and a session the host does not know yet (LiftLog
  // started before the link was up) is sent as soon as it is. A start the host already has is
  // answered with where the workout stands, so sending it again after an app restart is safe.
  addEffect(
    [activeSessionUpdated, openLinkStatusChanged, openLinkDevicesChanged],
    (_, { getState, dispatch, extra: { openLinkService } }) => {
      startWatchRecording(getState(), dispatch, openLinkService);
    },
  );

  addEffect(activeSessionUpdated, (action, { getState, extra: { openLinkService } }) => {
    const { before, after } = action.payload;
    if (!before || before.id === after?.id || !getState().openLink.recordings[before.id]) {
      return;
    }
    openLinkService.unsubscribeLive(before.id);
    openLinkService.stopRecording(before.id);
  });

  addEffect(sessionFinished, (action, { getState, extra: { openLinkService } }) => {
    const state = getState();
    const bodyweight = selectSession(state, action.payload)?.bodyweight;
    const { status } = state.openLink;
    if (
      !bodyweight ||
      bodyweight.unit === 'nil' ||
      status.kind !== 'connected' ||
      !status.grantedCapabilities.includes('profile')
    ) {
      return;
    }
    openLinkService.setBodyWeight(bodyweight.convertTo('kilograms').value.toNumber(), Date.now());
  });
}

function startWatchRecording(state: RootState, dispatch: AppDispatch, openLinkService: OpenLinkService) {
  const session = selectActiveSession(state);
  const { status, devices, recordings } = state.openLink;
  if (!state.settings.recordWorkoutsOnWatch || !session || recordings[session.id] || !canRecordOnWatch(status)) {
    return;
  }
  const device = pickRecordingDevice(devices);
  if (!device) {
    return;
  }
  dispatch(watchRecordingRequested({ sessionId: session.id, deviceId: device.id }));
  openLinkService.startRecording(session.id, device.id, strengthExerciseTypeFor(device), Date.now());
  if (
    status.kind === 'connected' &&
    status.grantedCapabilities.includes('live') &&
    device.liveSampleTypes.includes('HEART_RATE')
  ) {
    openLinkService.subscribeLive(session.id, device.id);
  }
}
