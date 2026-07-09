import { describe, expect, it } from "vitest";
import { FWC_META_SIZE } from "../protocol/commands";
import { writeU32Le } from "../util/bytes";
import { FW_HEADER_SIZE, parseImage } from "./parser";

function writeAscii(bytes: Uint8Array, offset: number, length: number, value: string): void {
  const encoded = new TextEncoder().encode(value);
  bytes.set(encoded.subarray(0, length), offset);
}

describe("image parser", () => {
  it("parses header and META entries", () => {
    const image = new Uint8Array(FW_HEADER_SIZE + FWC_META_SIZE + 16);
    writeAscii(image, 0, 8, "AIC.FW");
    writeAscii(image, 8, 64, "d21x");
    writeAscii(image, 72, 64, "demo");
    writeAscii(image, 136, 64, "1.0.0");
    writeAscii(image, 200, 64, "nand");
    writeU32Le(image, 332, FW_HEADER_SIZE);
    writeU32Le(image, 336, FWC_META_SIZE);
    writeU32Le(image, 340, FW_HEADER_SIZE + FWC_META_SIZE);
    writeU32Le(image, 344, 16);

    const metaOffset = FW_HEADER_SIZE;
    writeAscii(image, metaOffset, 8, "META");
    writeAscii(image, metaOffset + 8, 64, "image.target.os");
    writeAscii(image, metaOffset + 72, 64, "os");
    writeU32Le(image, metaOffset + 136, FW_HEADER_SIZE + FWC_META_SIZE);
    writeU32Le(image, metaOffset + 140, 16);
    writeU32Le(image, metaOffset + 144, 0x12345678);

    const parsed = parseImage(image, "firmware.img");
    expect(parsed.header.magic).toBe("AIC.FW");
    expect(parsed.header.platform).toBe("d21x");
    expect(parsed.metas).toHaveLength(1);
    expect(parsed.metas[0].name).toBe("image.target.os");
    expect(parsed.metas[0].partition).toBe("os");
    expect(parsed.metas[0].crc).toBe(0x12345678);
  });
});
