import type { ParsedImage } from "../image/types";

export interface LogEntry {
  id: number;
  time: string;
  level: "info" | "warn" | "error";
  message: string;
}

export interface DeviceState {
  supported: boolean;
  connected: boolean;
  label: string;
  infoText: string;
  busy: boolean;
}

export interface ImageState {
  parsed: ParsedImage | null;
  selectedParts: string[];
}
