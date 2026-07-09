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
import {
  CMD_GET_BLOCK_SIZE,
  CMD_GET_HWINFO,
  CMD_GET_STORAGE_MEDIA,
  CMD_RUN_SHELL_STR,
  CMD_SEND_FWC_DATA,
  CMD_SET_FWC_META,
  CMD_SET_UPG_CFG,
  CMD_SET_UPG_END,
  UPG_MODE_FULL_DISK_UPGRADE
} from "../protocol/commands";
import type { HwInfo } from "../protocol/types";
import {
  AIC_BULK_IN_ENDPOINT,
  AIC_BULK_OUT_ENDPOINT
} from "../transport/WebUsbTransport";
import type { UsbTransport } from "../transport/UsbTransport";
import type { ParsedImage } from "../image/types";
import { componentBytes } from "../image/parser";
import { crc32 } from "../util/crc32";
import { writeU32Le } from "../util/bytes";
import type { FirmwareComponent } from "./componentPlan";
import type { BurnEvent } from "./events";

const BULK_WRITE_CHUNK = 64 * 1024;
const BULK_READ_CHUNK = 64 * 1024;
const IMAGE_CHUNK_SIZE = 1024 * 1024;
const DEFAULT_BLOCK_SIZE = 2048;
const TRANSFER_TIMEOUT_MS = 10_000;
const CSW_TIMEOUT_MS = 10_000;
const SHORT_CSW_TIMEOUT_MS = 500;
const RECONNECT_SETTLE_MS = 120;
const OFFICIAL_UPG_CFG_RESERVED = new Uint8Array([
  0xea, 0x00, 0x00, 0xbc, 0xf5, 0x44, 0x04, 0x50, 0xf5, 0x44, 0x04, 0x01, 0x00,
  0x00, 0x00, 0x18, 0x73, 0xdf, 0x05, 0x50, 0xf5, 0x44, 0x04, 0x40, 0xfe, 0xf1,
  0x00, 0x18, 0x73, 0xdf, 0x05
]);

enum CswPolicy {
  Required,
  AllowMissing
}

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

  async setFullDiskUpgradeMode(): Promise<void> {
    const cfg = new Uint8Array(32);
    cfg[0] = UPG_MODE_FULL_DISK_UPGRADE;
    cfg.set(OFFICIAL_UPG_CFG_RESERVED, 1);
    await this.cmdHdrLenPrefixedDataResp(CMD_SET_UPG_CFG, cfg, 0);
  }

  async setFwcMeta(metaBytes: Uint8Array): Promise<void> {
    await this.cmdHdrDataResp(CMD_SET_FWC_META, metaBytes, 0);
  }

  async getBlockSize(): Promise<number> {
    const resp = await this.cmdHdrResp(CMD_GET_BLOCK_SIZE, 4);
    if (resp.payload.byteLength < 4) {
      throw new Error(`Block size response too short: ${resp.payload.byteLength} byte(s)`);
    }
    return new DataView(
      resp.payload.buffer,
      resp.payload.byteOffset,
      resp.payload.byteLength
    ).getUint32(0, true);
  }

  async startFwcData(totalLength: number): Promise<void> {
    await this.sendHeader(CMD_SEND_FWC_DATA, totalLength);
  }

  async writeFwcDataChunk(chunk: Uint8Array, policy = CswPolicy.Required): Promise<void> {
    await this.writeTxnPolicy(chunk, policy);
  }

  async finishFwcData(policy = CswPolicy.Required): Promise<void> {
    await this.readUpgResponse(CMD_SEND_FWC_DATA, 0, policy);
  }

  async setUpgradeEnd(): Promise<void> {
    const payload = new Uint8Array(36);
    writeU32Le(payload, 0, 32);
    await this.cmdHdrDataRespPolicy(CMD_SET_UPG_END, payload, 0, CswPolicy.AllowMissing);
  }

  async runShell(command: string): Promise<void> {
    const commandBytes = new TextEncoder().encode(command);
    const payload = new Uint8Array(4 + commandBytes.byteLength);
    writeU32Le(payload, 0, commandBytes.byteLength);
    payload.set(commandBytes, 4);
    await this.cmdHdrDataResp(CMD_RUN_SHELL_STR, payload, 0);
  }

  async reset(): Promise<void> {
    await this.runShell("reset");
  }

  async waitReconnect(timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    let lastError = "";
    await this.transport.close().catch((error: unknown) => {
      lastError = error instanceof Error ? error.message : String(error);
    });

    while (Date.now() < deadline) {
      try {
        await this.transport.open();
        await this.sleep(RECONNECT_SETTLE_MS);
        this.inBuffer = new Uint8Array();
        this.logTrace("Reconnected to ArtInChip device");
        return;
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        await this.sleep(250);
      }
    }

    throw new Error(lastError || "Timed out waiting for reconnect");
  }

  async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => window.setTimeout(resolve, ms));
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

  private async cmdHdrDataResp(
    command: number,
    payload: Uint8Array,
    expectedPayloadLen: number
  ): Promise<UpgResponse> {
    return this.cmdHdrDataRespPolicy(command, payload, expectedPayloadLen, CswPolicy.Required);
  }

  private async cmdHdrDataRespPolicy(
    command: number,
    payload: Uint8Array,
    expectedPayloadLen: number,
    policy: CswPolicy
  ): Promise<UpgResponse> {
    this.logTrace(`cmd 0x${command.toString(16).padStart(2, "0")}: send header+data`);
    await this.sendHeader(command, payload.byteLength);
    const csw = await this.writeTxnPolicy(payload, policy);
    if (policy === CswPolicy.AllowMissing && !csw) {
      return { payload: new Uint8Array() };
    }
    return this.readUpgResponse(command, expectedPayloadLen, policy);
  }

  private async cmdHdrLenPrefixedDataResp(
    command: number,
    payload: Uint8Array,
    expectedPayloadLen: number
  ): Promise<UpgResponse> {
    this.logTrace(`cmd 0x${command.toString(16).padStart(2, "0")}: send len-prefixed data`);
    await this.sendHeader(command, payload.byteLength + 4);
    const length = new Uint8Array(4);
    writeU32Le(length, 0, payload.byteLength);
    await this.writeTxn(length);
    await this.writeTxn(payload);
    return this.readUpgResponse(command, expectedPayloadLen);
  }

  private async sendHeader(command: number, dataLength: number): Promise<void> {
    await this.writeTxn(buildCmdHeader(command, dataLength));
  }

  private async readUpgResponse(
    command: number,
    expectedPayloadLen: number,
    policy = CswPolicy.Required
  ): Promise<UpgResponse> {
    this.logTrace(`cmd 0x${command.toString(16).padStart(2, "0")}: read response header`);
    let headerData: Uint8Array;
    try {
      headerData = await this.readTxnPolicy(RESP_MIN_HDR_LEN, policy);
    } catch (error) {
      if (policy === CswPolicy.AllowMissing) {
        this.logTrace(
          `cmd 0x${command.toString(16).padStart(2, "0")}: response missing accepted`
        );
        return { payload: new Uint8Array() };
      }
      throw error;
    }
    const header = parseRespHeader(headerData, command);
    const payloadLen = header.dataLength > 0 ? header.dataLength : expectedPayloadLen;
    this.logTrace(
      `cmd 0x${command.toString(16).padStart(2, "0")}: response payload ${payloadLen} byte(s)`
    );
    let payload: Uint8Array<ArrayBufferLike> = new Uint8Array();
    if (payloadLen > 0) {
      try {
        payload = await this.readTxnPolicy(payloadLen, policy);
      } catch (error) {
        if (policy === CswPolicy.AllowMissing) {
          this.logTrace(
            `cmd 0x${command.toString(16).padStart(2, "0")}: payload missing accepted`
          );
          payload = new Uint8Array();
        } else {
          throw error;
        }
      }
    }
    return { payload };
  }

  private async writeTxn(payload: Uint8Array): Promise<void> {
    const csw = await this.writeTxnPolicy(payload, CswPolicy.Required);
    if (!csw) {
      throw new Error("CSW unexpectedly missing");
    }
  }

  private async writeTxnPolicy(
    payload: Uint8Array,
    policy: CswPolicy
  ): Promise<ReturnType<typeof parseCsw> | null> {
    const tag = this.nextTag();
    this.logTrace(`WRITE txn tag=${tag} len=${payload.byteLength}`);
    await this.writeBulk(buildWriteCbw(tag, payload.byteLength));
    if (payload.byteLength > 0) {
      await this.writeBulk(payload);
    }
    const csw = await this.readCsw(tag, policy);
    if (csw) {
      assertOkCsw(csw, tag);
    }
    return csw;
  }

  private async readTxn(readLength: number): Promise<Uint8Array> {
    return this.readTxnPolicy(readLength, CswPolicy.Required);
  }

  private async readTxnPolicy(readLength: number, policy: CswPolicy): Promise<Uint8Array> {
    const tag = this.nextTag();
    this.logTrace(`READ txn tag=${tag} len=${readLength}`);
    await this.writeBulk(buildReadCbw(tag, readLength));
    const data = await this.readExactFromIn(readLength);
    const csw = await this.readCsw(tag, policy);
    if (csw) {
      assertOkCsw(csw, tag);
    }
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

  private async readCsw(expectedTag: number, policy: CswPolicy) {
    const timeoutMs = policy === CswPolicy.AllowMissing ? SHORT_CSW_TIMEOUT_MS : CSW_TIMEOUT_MS;
    const deadline = Date.now() + timeoutMs;
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
        if (policy === CswPolicy.AllowMissing) {
          this.logTrace(`No CSW for tag ${expectedTag}; accepted by policy`);
          return null;
        }
        throw new Error(`No CSW for tag ${expectedTag} before timeout`);
      }
      try {
        await this.readBulkToBuffer(CSW_LEN, timeoutMs);
      } catch (error) {
        if (policy === CswPolicy.AllowMissing) {
          this.logTrace(`No CSW for tag ${expectedTag}; accepted by policy`);
          return null;
        }
        throw error;
      }
    }
  }

  private async readBulkToBuffer(length: number, timeoutMs = TRANSFER_TIMEOUT_MS): Promise<void> {
    const requested = Math.max(1, length);
    this.logTrace(`<< bulk IN request ${requested} byte(s)`);
    const chunk = await this.withTimeout(
      this.transport.transferIn(AIC_BULK_IN_ENDPOINT, requested),
      `bulk IN ${requested} byte(s)`,
      timeoutMs
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

  private async withTimeout<T>(
    promise: Promise<T>,
    label: string,
    timeoutMs = TRANSFER_TIMEOUT_MS
  ): Promise<T> {
    let timeoutId: number | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = window.setTimeout(() => {
        reject(new Error(`${label} timed out after ${timeoutMs} ms`));
      }, timeoutMs);
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

  async *sendComponent(
    image: ParsedImage,
    component: FirmwareComponent,
    allowFinalNoCsw: boolean,
    overallSentStart: number,
    overallTotal: number
  ): AsyncIterable<BurnEvent> {
    const { meta } = component;
    const bytes = componentBytes(image, meta);
    const expectedCrc = meta.crc >>> 0;
    let overallSent = overallSentStart;

    yield {
      type: "component-started",
      name: meta.name,
      partition: meta.partition,
      size: meta.size
    };

    await this.setFwcMeta(meta.bytes);

    let blockSize = DEFAULT_BLOCK_SIZE;
    try {
      blockSize = await this.getBlockSize();
    } catch (error) {
      yield {
        type: "log",
        message: `Warning: failed to read block size; using ${DEFAULT_BLOCK_SIZE}: ${
          error instanceof Error ? error.message : String(error)
        }`
      };
    }

    await this.startFwcData(meta.size);

    let sent = 0;
    const chunkMax =
      component.kind === "updater" ? Math.max(blockSize * 512, 512) : IMAGE_CHUNK_SIZE;
    while (sent < bytes.byteLength) {
      const end = Math.min(sent + chunkMax, bytes.byteLength);
      await this.writeFwcDataChunk(bytes.subarray(sent, end), CswPolicy.Required);
      const written = end - sent;
      sent = end;
      overallSent += written;

      yield {
        type: "component-progress",
        name: meta.name,
        sent,
        total: bytes.byteLength
      };
      yield {
        type: "overall-progress",
        sent: overallSent,
        total: overallTotal
      };
    }

    await this.finishFwcData(allowFinalNoCsw ? CswPolicy.AllowMissing : CswPolicy.Required);

    const actualCrc = crc32(bytes);
    if (actualCrc !== expectedCrc) {
      yield {
        type: "log",
        message: `WARNING: ${meta.name} CRC mismatch, expected=0x${expectedCrc
          .toString(16)
          .padStart(8, "0")}, actual=0x${actualCrc.toString(16).padStart(8, "0")}`
      };
    } else {
      yield {
        type: "log",
        message: `${meta.name} CRC OK (0x${actualCrc.toString(16).padStart(8, "0")})`
      };
    }

    yield {
      type: "component-finished",
      name: meta.name
    };
  }
}
