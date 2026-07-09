import { describe, expect, it } from "vitest";
import {
  buildCmdHeader,
  buildReadCbw,
  buildWriteCbw,
  parseCsw,
  TRANS_LAYER_CMD_READ,
  TRANS_LAYER_CMD_WRITE
} from "./cbwCsw";

describe("protocol builders", () => {
  it("builds official compatible UPG command header", () => {
    expect(Array.from(buildCmdHeader(0x12, 30480))).toEqual([
      0x55, 0x50, 0x47, 0x43, 0x01, 0x01, 0x12, 0x00, 0x10, 0x77, 0x00, 0x00,
      0x66, 0xc8, 0x59, 0x43
    ]);
  });

  it("builds CBW command lengths", () => {
    const write = buildWriteCbw(0xc8, 16);
    expect(write[14]).toBe(1);
    expect(write[15]).toBe(TRANS_LAYER_CMD_WRITE);

    const read = buildReadCbw(0xc9, 16);
    expect(read[12]).toBe(0x80);
    expect(read[14]).toBe(1);
    expect(read[15]).toBe(TRANS_LAYER_CMD_READ);
  });

  it("parses CSW status and tag", () => {
    const bytes = new Uint8Array(13);
    bytes.set([0x55, 0x53, 0x42, 0x53], 0);
    bytes.set([7, 0, 0, 0], 4);

    const csw = parseCsw(bytes);
    expect(csw.signature).toBe(0x53425355);
    expect(csw.tag).toBe(7);
    expect(csw.status).toBe(0);
  });
});
