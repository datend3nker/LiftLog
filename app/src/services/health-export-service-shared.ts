import { Session } from '@/models/session-models';

export interface HealthExportService {
  canExport(): boolean;
  /**
   * `withExerciseSession: false` when a watch recorded the workout: whoever measures it writes it,
   * so the session is the watch app's and only what LiftLog measured itself is written here.
   */
  exportWorkout(workout: Session, options: { withExerciseSession: boolean }): Promise<void>;
  requestPermission(): Promise<void>;
  deleteWorkout(workoutId: string): Promise<void>;
}
