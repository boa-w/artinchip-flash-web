import {
  assertOkCsw,
  buildCmdHeader,
  buildReadCbw,
  buildWriteCbw,
  CSW_LEN,
  findCswSignature,
  parseCsw,
  parseHwInfo,
  parseRespHeader,
  RESP_MIN_HDR_LEN
} from "../protocol/cbwCsw";
import { CMD_GET_HWINFO, CMD_GET_STORAGE_MEDIA } from "../protocol/commands";
import type { HwInfo } from "../protocol/types";
import {
  AIC_BULK_IN_ENDPOINT,
  AIC_BULK_OUT_ENDPOINT
} from "../transport/WebUsbTransport";
import type { UsbTransport } from "../transport/UsbTransport";

const BULK_WRITE_CHUNK = 64 * 1024;
const BULK_READ_CHUNK = 64 * 1024;
const TRANSFER_TIMEOUT_MS = 10_000;
const CSW_TIMEOUT_MS = 10_000;

interface UpgResponse {
  payload: Uint8Array;
}

export type ProtocolTrace = (message: string) => void;

export class AicDevice {
  private tag = 1;
  private inBuffer = new Uint8Array();

  constructor(
    private readonly transport: UsbTransport,
    private readonly trace?: ProtocolTrace
  ) {}

  async open(): Promise<void> {
    await this.transport.open();
  }

  async close(): Promise<void> {
    await this.transport.close();
  }

  async getHwInfo(): Promise<HwInfo> {
    this.logTrace("GET_HWINFO");
    const resp = await this.cmdHdrResp(CMD_GET_HWINFO, 104);
    return parseHwInfo(resp.payload);
  }

  async getStorageMedia(): Promise<string> {
    this.logTrace("GET_STORAGE_MEDIA");
    const resp = await this.cmdHdrResp(CMD_GET_STORAGE_MEDIA, 64);
    return new TextDecoder()
      .decode(resp.payload)
      .replace(/\0+$/g, "")
      .trim();
  }

  async deviceInfoText(): Promise<string> {
    const hwInfo = await this.getHwInfo();
    const lines = [
      `Magic:        ${hwInfo.magic}`,
      `Init mode:    0x${hwInfo.initMode.toString(16)}`,
      `Current mode: 0x${hwInfo.currentMode.toString(16)}`,
      `Boot stage:   ${hwInfo.bootStage}`,
      `Chip ID:      ${hwInfo.chipId.map((part) => part.toString(16).padStart(8, "0")).join(" ")}`
    ];

    try {
      const media = await this.getStorageMedia();
      if (media) {
        lines.push(`Storage media: ${media}`);
      }
    } catch {
      lines.push("Storage media: unavailable");
    }

    return lines.join("\n");
  }

  private async cmdHdrResp(command: number, expectedPayloadLen: number): Promise<UpgResponse> {
    this.logTrace(`cmd 0x${command.toString(16).padStart(2, "0")}: send header`);
    await this.sendHeader(command, 0);
    return this.readUpgResponse(command, expectedPayloadLen);
  }

  private async sendHeader(command: number, dataLength: number): Promise<void> {
    await this.writeTxn(buildCmdHeader(command, dataLength));
  }

  private async readUpgResponse(
    command: number,
    expectedPayloadLen: number
  ): Promise<UpgResponse> {
    this.logTrace(`cmd 0x${command.toString(16).padStart(2, "0")}: read response header`);
    const headerData = await this.readTxn(RESP_MIN_HDR_LEN);
    const header = parseRespHeader(headerData, command);
    const payloadLen = header.dataLength > 0 ? header.dataLength : expectedPayloadLen;
    this.logTrace(
      `cmd 0x${command.toString(16).padStart(2, "0")}: response payload ${payloadLen} byte(s)`
    );
    const payload = payloadLen > 0 ? await this.readTxn(payloadLen) : new Uint8Array();
    return { payload };
  }

  private async writeTxn(payload: Uint8Array): Promise<void> {
    const tag = this.nextTag();
    this.logTrace(`WRITE txn tag=${tag} len=${payload.byteLength}`);
    await this.writeBulk(buildWriteCbw(tag, payload.byteLength));
    if (payload.byteLength > 0) {
      await this.writeBulk(payload);
    }
    const csw = await this.readCsw(tag);
    assertOkCsw(csw, tag);
  }

  private async readTxn(readLength: number): Promise<Uint8Array> {
    const tag = this.nextTag();
    this.logTrace(`READ txn tag=${tag} len=${readLength}`);
    await this.writeBulk(buildReadCbw(tag, readLength));
    const data = await this.readExactFromIn(readLength);
    const csw = await this.readCsw(tag);
    assertOkCsw(csw, tag);
    return data;
  }

  private nextTag(): number {
    const tag = this.tag;
    this.tag = (this.tag + 1) >>> 0;
    if (this.tag === 0) {
      this.tag = 1;
    }
    return tag;
  }

  private async writeBulk(data: Uint8Array): Promise<void> {
    for (let offset = 0; offset < data.byteLength; offset += BULK_WRITE_CHUNK) {
      const chunk = data.subarray(offset, Math.min(offset + BULK_WRITE_CHUNK, data.byteLength));
      this.logTrace(`>> bulk OUT ${chunk.byteLength} byte(s)`);
      await this.withTimeout(
        this.transport.transferOut(AIC_BULK_OUT_ENDPOINT, chunk),
        `bulk OUT ${chunk.byteLength} byte(s)`
      );
    }
  }

  private async readExactFromIn(length: number): Promise<Uint8Array> {
    const deadline = Date.now() + TRANSFER_TIMEOUT_MS;
    while (this.inBuffer.byteLength < length) {
      const unexpectedCsw = this.unexpectedCswError("Bulk read");
      if (unexpectedCsw) {
        throw unexpectedCsw;
      }
      if (Date.now() >= deadline) {
        throw new Error(
          `Bulk read timed out with ${this.inBuffer.byteLength}/${length} byte(s) buffered`
        );
      }
      await this.readBulkToBuffer(Math.min(BULK_READ_CHUNK, length - this.inBuffer.byteLength));
    }
    return this.consume(length);
  }

  private async readCsw(expectedTag: number) {
    const deadline = Date.now() + CSW_TIMEOUT_MS;
    for (;;) {
      const pos = findCswSignature(this.inBuffer);
      if (pos >= 0) {
        if (pos > 0) {
          this.inBuffer = this.inBuffer.slice(pos);
        }
        if (this.inBuffer.byteLength < CSW_LEN) {
          await this.readBulkToBuffer(CSW_LEN - this.inBuffer.byteLength);
          continue;
        }
        const csw = parseCsw(this.inBuffer.subarray(0, CSW_LEN));
        this.consume(CSW_LEN);
        if (csw.tag === expectedTag) {
          this.logTrace(
            `<< CSW tag=${csw.tag} status=${csw.status} residue=${csw.dataResidue}`
          );
          return csw;
        }
        this.logTrace(`<< stale CSW tag=${csw.tag}; expected tag=${expectedTag}`);
        continue;
      }

      if (this.inBuffer.byteLength > 3) {
        this.inBuffer = this.inBuffer.slice(this.inBuffer.byteLength - 3);
      }
      if (Date.now() >= deadline) {
        throw new Error(`No CSW for tag ${expectedTag} before timeout`);
      }
      await this.readBulkToBuffer(CSW_LEN);
    }
  }

  private async readBulkToBuffer(length: number): Promise<void> {
    const requested = Math.max(1, length);
    this.logTrace(`<< bulk IN request ${requested} byte(s)`);
    const chunk = await this.withTimeout(
      this.transport.transferIn(AIC_BULK_IN_ENDPOINT, requested),
      `bulk IN ${requested} byte(s)`
    );
    this.logTrace(`<< bulk IN received ${chunk.byteLength} byte(s)`);
    if (chunk.byteLength === 0) {
      return;
    }
    const next = new Uint8Array(this.inBuffer.byteLength + chunk.byteLength);
    next.set(this.inBuffer, 0);
    next.set(chunk, this.inBuffer.byteLength);
    this.inBuffer = next;
  }

  private consume(length: number): Uint8Array {
    const out = this.inBuffer.slice(0, length);
    this.inBuffer = this.inBuffer.slice(length);
    return out;
  }

  private unexpectedCswError(context: string): Error | null {
    if (this.inBuffer.byteLength < CSW_LEN || findCswSignature(this.inBuffer) !== 0) {
      return null;
    }
    const csw = parseCsw(this.inBuffer.subarray(0, CSW_LEN));
    return new Error(
      `${context}: device returned CSW instead of DATA (tag=${csw.tag}, status=${csw.status}, residue=${csw.dataResidue}, buffered=${this.inBuffer.byteLength})`
    );
  }

  private async withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
    let timeoutId: number | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = window.setTimeout(() => {
        reject(new Error(`${label} timed out after ${TRANSFER_TIMEOUT_MS} ms`));
      }, TRANSFER_TIMEOUT_MS);
    });

    try {
      return await Promise.race([promise, timeout]);
    } finally {
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
    }
  }

  private logTrace(message: string): void {
    this.trace?.(message);
  }
}
