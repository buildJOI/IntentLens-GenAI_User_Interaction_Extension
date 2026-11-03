export const GAZE_SOURCE = "intentlens-gaze";

export type GazeFrameMessage =
  | { source: typeof GAZE_SOURCE; kind: "ready" }
  | { source: typeof GAZE_SOURCE; kind: "tracking-ready" }
  | { source: typeof GAZE_SOURCE; kind: "denied" }
  | { source: typeof GAZE_SOURCE; kind: "unavailable"; reason: string }
  | {
      source: typeof GAZE_SOURCE;
      kind: "sample";
      x: number;
      y: number;
      t: number;
      missing: boolean;
    }
  | { source: typeof GAZE_SOURCE; kind: "calibrated" };

export type HostToGaze =
  | { source: typeof GAZE_SOURCE; kind: "start" }
  | { source: typeof GAZE_SOURCE; kind: "stop" }
  | { source: typeof GAZE_SOURCE; kind: "calibrate"; x: number; y: number }
  | { source: typeof GAZE_SOURCE; kind: "frame"; bitmap: ImageBitmap };
