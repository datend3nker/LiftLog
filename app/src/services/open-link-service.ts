import {
  OpenLinkDevice,
  OpenLinkLiveBatch,
  OpenLinkModule,
  OpenLinkRecordingState,
  OpenLinkStatus,
} from '~/modules/openlink';

export interface OpenLinkListener {
  status(status: OpenLinkStatus): void;
  devices(devices: OpenLinkDevice[]): void;
  recordingState(state: OpenLinkRecordingState): void;
  liveSamples(batch: OpenLinkLiveBatch): void;
}

/** LiftLog as an OpenLink client of OpenWatch. Every call is a no-op where OpenLink is missing. */
export class OpenLinkService {
  constructor(private readonly module = OpenLinkModule) {}

  isAvailable(): boolean {
    return this.module?.isSupported() ?? false;
  }

  isHostInstalled(): boolean {
    return this.module?.isHostInstalled() ?? false;
  }

  setListener(listener: OpenLinkListener) {
    const module = this.module;
    if (!module?.isSupported()) {
      return;
    }
    module.addListener('onStatus', listener.status);
    module.addListener('onDevices', ({ devices }) => listener.devices(devices));
    module.addListener('onRecordingState', listener.recordingState);
    module.addListener('onLiveSamples', listener.liveSamples);
    listener.status(module.getStatus());
    listener.devices(module.getDevices());
  }

  start() {
    this.module?.start();
  }

  stop() {
    this.module?.stop();
  }

  refresh() {
    this.module?.refresh();
  }

  trustHost(signerSha256: string) {
    this.module?.trustHost(signerSha256);
  }

  openConsent(): boolean {
    return this.module?.openConsent() ?? false;
  }

  startRecording(sessionId: string, deviceId: string, exerciseType: number, startedAtMillis: number) {
    this.module?.startRecording(sessionId, deviceId, exerciseType, startedAtMillis);
  }

  stopRecording(sessionId: string) {
    this.module?.stopRecording(sessionId);
  }

  subscribeLive(sessionId: string, deviceId: string) {
    this.module?.subscribeLive(sessionId, deviceId);
  }

  unsubscribeLive(sessionId: string) {
    this.module?.unsubscribeLive(sessionId);
  }

  setBodyWeight(weightKg: number, atMillis: number) {
    this.module?.setBodyWeight(weightKg, atMillis);
  }
}
