export interface Csw {
  signature: number;
  tag: number;
  dataResidue: number;
  status: number;
}

export interface RespHeader {
  magic: number;
  protocol: number;
  version: number;
  command: number;
  status: number;
  dataLength: number;
  checksum: number;
}

export interface HwInfo {
  magic: string;
  initMode: number;
  currentMode: number;
  bootStage: number;
  chipId: [number, number, number, number];
  raw: Uint8Array;
}
