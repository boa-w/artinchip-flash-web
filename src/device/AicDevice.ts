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

interface UpgResponse {
  payload: Uint8Array;
}

export class AicDevice {
  private tag = 1;
  private inBuffer = new Uint8Array();

  constructor(private readonly transport: UsbTransport) {}

  async open(): Promise<void> {
    await this.transport.open();
  }

  async close(): Promise<void> {
    await this.transport.close();
  }

  async getHwInfo(): Promise<HwInfo> {
    const resp = await this.cmdHdrResp(CMD_GET_HWINFO, 104);
    return parseHwInfo(resp.payload);
  }

  async getStorageMedia(): Promise<string> {
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
    const headerData = await this.readTxn(RESP_MIN_HDR_LEN);
    const header = parseRespHeader(headerData, command);
    const payloadLen = header.dataLength > 0 ? header.dataLength : expectedPayloadLen;
    const payload = payloadLen > 0 ? await this.readTxn(payloadLen) : new Uint8Array();
    return { payload };
  }

  private async writeTxn(payload: Uint8Array): Promise<void> {
    const tag = this.nextTag();
    await this.writeBulk(buildWriteCbw(tag, payload.byteLength));
    if (payload.byteLength > 0) {
      await this.writeBulk(payload);
    }
    const csw = await this.readCsw(tag);
    assertOkCsw(csw, tag);
  }

  private async readTxn(readLength: number): Promise<Uint8Array> {
    const tag = this.nextTag();
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
      await this.transport.transferOut(
        AIC_BULK_OUT_ENDPOINT,
        data.subarray(offset, Math.min(offset + BULK_WRITE_CHUNK, data.byteLength))
      );
    }
  }

  private async readExactFromIn(length: number): Promise<Uint8Array> {
    while (this.inBuffer.byteLength < length) {
      await this.readBulkToBuffer(Math.min(BULK_READ_CHUNK, length - this.inBuffer.byteLength));
    }
    return this.consume(length);
  }

  private async readCsw(expectedTag: number) {
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
          return csw;
        }
        continue;
      }

      if (this.inBuffer.byteLength > 3) {
        this.inBuffer = this.inBuffer.slice(this.inBuffer.byteLength - 3);
      }
      await this.readBulkToBuffer(CSW_LEN);
    }
  }

  private async readBulkToBuffer(length: number): Promise<void> {
    const chunk = await this.transport.transferIn(AIC_BULK_IN_ENDPOINT, Math.max(1, length));
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
}
