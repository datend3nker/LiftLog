import { NativeModule, requireOptionalNativeModule } from 'expo';

export type OpenLinkStatus =
  | { kind: 'stopped' | 'hostMissing' | 'unreachable' | 'connecting' }
  | { kind: 'hostUntrusted'; signerSha256: string }
  | {
      kind: 'connected';
      protocolVersion: number;
      trust: 'PENDING' | 'TRUSTED' | 'BLOCKED';
      grantedCapabilities: string[];
      canOpenConsent: boolean;
    };

export interface OpenLinkDevice {
  id: string;
  displayName: string;
  kind: 'WATCH' | 'BIKE_COMPUTER' | 'SCALE';
  connection: 'CONNECTED' | 'DISCONNECTED' | 'UNKNOWN';
  batteryPercent: number | null;
  supportsRecording: boolean;
  recordingFeatures: ('GPS' | 'HEART_RATE' | 'PAUSE' | 'AUTO_PAUSE')[];
  exerciseTypes: number[];
}

export interface OpenLinkWorkoutSummary {
  zoneSeconds: number[];
  zoneLowerBoundsBpm: number[];
  trimp: number | null;
  heartRateRecovery1MinBpm: number | null;
  heartRateRecovery2MinBpm: number | null;
}

export interface OpenLinkRecordingState {
  sessionId: string;
  deviceId: string;
  phase: 'STARTING' | 'RECORDING' | 'PAUSED' | 'STOPPED' | 'FAILED';
  reason: string | null;
  atMillis: number;
  summary: OpenLinkWorkoutSummary | null;
}

type OpenLinkEvents = {
  onStatus(status: OpenLinkStatus): void;
  onDevices(event: { devices: OpenLinkDevice[] }): void;
  onRecordingState(state: OpenLinkRecordingState): void;
};

declare class OpenLinkNativeModule extends NativeModule<OpenLinkEvents> {
  isSupported(): boolean;
  isHostInstalled(): boolean;
  getStatus(): OpenLinkStatus;
  getDevices(): OpenLinkDevice[];
  start(): void;
  stop(): void;
  refresh(): void;
  trustHost(signerSha256: string): void;
  openConsent(): boolean;
  startRecording(sessionId: string, deviceId: string, exerciseType: number, startedAtMillis: number): void;
  pauseRecording(sessionId: string): void;
  resumeRecording(sessionId: string): void;
  stopRecording(sessionId: string): void;
  setBodyWeight(weightKg: number, atMillis: number): void;
}

/** Undefined where OpenLink does not exist: iOS, web, tests. */
export const OpenLinkModule = requireOptionalNativeModule<OpenLinkNativeModule>('OpenLink') ?? undefined;
