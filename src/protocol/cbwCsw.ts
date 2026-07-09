import { asciiZ, readU32Le, writeU32Le } from "../util/bytes";
import type { Csw, HwInfo, RespHeader } from "./types";

export const AIC_USB_SIGN_USBC = 0x43425355;
export const AIC_USB_SIGN_USBS = 0x53425355;
export const AIC_UPG_SIGN_UPGC = 0x43475055;
export const AIC_UPG_SIGN_UPGR = 0x52475055;

export const TRANS_LAYER_CMD_WRITE = 0x01;
export const TRANS_LAYER_CMD_READ = 0x02;

export const CBW_LEN = 31;
export const CSW_LEN = 13;
export const CMD_HDR_LEN = 16;
export const RESP_MIN_HDR_LEN = 16;

export function buildWriteCbw(tag: number, dataLength: number): Uint8Array {
  const bytes = new Uint8Array(CBW_LEN);
  writeU32Le(bytes, 0, AIC_USB_SIGN_USBC);
  writeU32Le(bytes, 4, tag);
  writeU32Le(bytes, 8, dataLength);
  bytes[14] = 1;
  bytes[15] = TRANS_LAYER_CMD_WRITE;
  return bytes;
}

export function buildReadCbw(tag: number, dataLength: number): Uint8Array {
  const bytes = new Uint8Array(CBW_LEN);
  writeU32Le(bytes, 0, AIC_USB_SIGN_USBC);
  writeU32Le(bytes, 4, tag);
  writeU32Le(bytes, 8, dataLength);
  bytes[12] = 0x80;
  bytes[14] = 1;
  bytes[15] = TRANS_LAYER_CMD_READ;
  return bytes;
}

export function parseCsw(bytes: Uint8Array): Csw {
  if (bytes.byteLength < CSW_LEN) {
    throw new Error(`CSW too short: ${bytes.byteLength} bytes`);
  }
  return {
    signature: readU32Le(bytes, 0),
    tag: readU32Le(bytes, 4),
    dataResidue: readU32Le(bytes, 8),
    status: bytes[12]
  };
}

export function assertOkCsw(csw: Csw, expectedTag: number): void {
  if (csw.signature !== AIC_USB_SIGN_USBS) {
    throw new Error(`Invalid CSW signature 0x${csw.signature.toString(16)}`);
  }
  if (csw.tag !== expectedTag) {
    throw new Error(`CSW tag mismatch: got ${csw.tag}, expected ${expectedTag}`);
  }
  if (csw.status !== 0) {
    throw new Error(`CSW failed: status=${csw.status} residue=${csw.dataResidue}`);
  }
}

export function findCswSignature(bytes: Uint8Array): number {
  const sig = new Uint8Array([
    AIC_USB_SIGN_USBS & 0xff,
    (AIC_USB_SIGN_USBS >>> 8) & 0xff,
    (AIC_USB_SIGN_USBS >>> 16) & 0xff,
    (AIC_USB_SIGN_USBS >>> 24) & 0xff
  ]);
  for (let i = 0; i <= bytes.byteLength - sig.byteLength; i += 1) {
    if (
      bytes[i] === sig[0] &&
      bytes[i + 1] === sig[1] &&
      bytes[i + 2] === sig[2] &&
      bytes[i + 3] === sig[3]
    ) {
      return i;
    }
  }
  return -1;
}

export function buildCmdHeader(command: number, dataLength: number): Uint8Array {
  const bytes = new Uint8Array(CMD_HDR_LEN);
  writeU32Le(bytes, 0, AIC_UPG_SIGN_UPGC);
  bytes[4] = 0x01;
  bytes[5] = 0x01;
  bytes[6] = command & 0xff;
  writeU32Le(bytes, 8, dataLength);

  const checksum =
    (AIC_UPG_SIGN_UPGC +
      (((command & 0xff) << 16) | (0x01 << 8) | 0x01) +
      (dataLength >>> 0)) >>>
    0;
  writeU32Le(bytes, 12, checksum);
  return bytes;
}

export function parseRespHeader(bytes: Uint8Array, expectedCommand: number): RespHeader {
  if (bytes.byteLength < RESP_MIN_HDR_LEN) {
    throw new Error(`Response header too short: ${bytes.byteLength} bytes`);
  }
  const header = {
    magic: readU32Le(bytes, 0),
    protocol: bytes[4],
    version: bytes[5],
    command: bytes[6],
    status: bytes[7],
    dataLength: readU32Le(bytes, 8),
    checksum: readU32Le(bytes, 12)
  };
  if (header.magic !== AIC_UPG_SIGN_UPGR || header.status !== 0) {
    throw new Error(
      `Command 0x${expectedCommand.toString(16).padStart(2, "0")} failed, status=${header.status}, magic=0x${header.magic.toString(16)}`
    );
  }
  return header;
}

export function parseHwInfo(bytes: Uint8Array): HwInfo {
  if (bytes.byteLength < 104) {
    throw new Error(`HWINFO too short: ${bytes.byteLength} bytes`);
  }
  return {
    magic: asciiZ(bytes, 0, 8),
    initMode: readU32Le(bytes, 8),
    currentMode: readU32Le(bytes, 12),
    bootStage: readU32Le(bytes, 16),
    chipId: [
      readU32Le(bytes, 48),
      readU32Le(bytes, 52),
      readU32Le(bytes, 56),
      readU32Le(bytes, 60)
    ],
    raw: bytes.slice()
  };
}
