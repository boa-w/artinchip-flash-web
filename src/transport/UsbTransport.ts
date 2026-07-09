export interface UsbTransport {
  readonly connected: boolean;
  open(): Promise<void>;
  close(): Promise<void>;
  transferOut(endpointNumber: number, data: Uint8Array): Promise<void>;
  transferIn(endpointNumber: number, length: number): Promise<Uint8Array>;
  clearHalt?(direction: "in" | "out", endpointNumber: number): Promise<void>;
}
