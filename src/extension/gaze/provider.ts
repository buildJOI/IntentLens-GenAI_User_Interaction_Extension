import type { CalibrationStatus } from "../../core/schema/events.js";

/**
 * Replaceable gaze backend. WebGazer is the default adapter; another library
 * can implement this interface without changing collectors or analytics.
 *
 * WebGazer notes (as of the vendored 3.x package):
 * - Research-grade webcam estimate, not a calibrated eye tracker.
 * - It does not expose a statistically meaningful per-sample confidence.
 * - IntentLens therefore reports a documented quality indicator plus hold-out
 *   pixel residual, never a fabricated confidence probability.
 * - Predictions may be influenced by cursor-assisted training.
 */
export interface GazeSample {
  x: number;
  y: number;
  t: number;
  missing: boolean;
}

export interface GazeHealth {
  camera: "unknown" | "available" | "denied" | "unavailable" | "unsupported";
  ready: boolean;
  lastSampleAt?: number;
  calibrationStatus: CalibrationStatus;
}

export interface GazeProvider {
  readonly id: string;
  initialize(): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  addCalibrationObservation(x: number, y: number): Promise<void>;
  onSample(listener: (sample: GazeSample) => void): () => void;
  health(): GazeHealth;
}

export class UnavailableGazeProvider implements GazeProvider {
  readonly id = "unavailable";
  async initialize(): Promise<void> {}
  async start(): Promise<void> {}
  async stop(): Promise<void> {}
  async addCalibrationObservation(): Promise<void> {}
  onSample(): () => void {
    return () => undefined;
  }
  health(): GazeHealth {
    return { camera: "unavailable", ready: false, calibrationStatus: "failed" };
  }
}
