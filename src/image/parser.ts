import { FWC_META_SIZE } from "../protocol/commands";
import { asciiZ, readU32Le } from "../util/bytes";
import type { FwcMeta, FwHeader, ParsedImage } from "./types";

export const FW_HEADER_SIZE = 2048;

export async function parseImageFile(file: File): Promise<ParsedImage> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return parseImage(bytes, file.name);
}

export function parseImage(bytes: Uint8Array, fileName?: string): ParsedImage {
  const header = parseHeader(bytes);

  if (header.magic !== "AIC.FW") {
    throw new Error(`Invalid image magic '${header.magic}' (expected 'AIC.FW')`);
  }

  const metaOffset = header.metaOffset;
  const metaSize = header.metaSize;
  if (metaOffset === 0 || metaSize === 0) {
    throw new Error("No META entries in image header");
  }
  if (metaSize % FWC_META_SIZE !== 0) {
    throw new Error(`META size ${metaSize} is not aligned to ${FWC_META_SIZE}`);
  }

  const metaEnd = metaOffset + metaSize;
  if (bytes.byteLength < metaEnd) {
    throw new Error(
      `File too short for META entries: need ${metaEnd} bytes, have ${bytes.byteLength}`
    );
  }

  const metas: FwcMeta[] = [];
  for (let offset = metaOffset, index = 0; offset < metaEnd; offset += FWC_META_SIZE, index += 1) {
    metas.push(parseMeta(bytes.subarray(offset, offset + FWC_META_SIZE), index));
  }

  return {
    fileName,
    totalSize: bytes.byteLength,
    header,
    metas,
    bytes
  };
}

export function parseHeader(bytes: Uint8Array): FwHeader {
  if (bytes.byteLength < FW_HEADER_SIZE) {
    throw new Error("File too small to contain image header");
  }

  return {
    magic: asciiZ(bytes, 0, 8),
    platform: asciiZ(bytes, 8, 72),
    product: asciiZ(bytes, 72, 136),
    version: asciiZ(bytes, 136, 200),
    mediaType: asciiZ(bytes, 200, 264),
    mediaDevId: readU32Le(bytes, 264),
    mediaId: asciiZ(bytes, 268, 332),
    metaOffset: readU32Le(bytes, 332),
    metaSize: readU32Le(bytes, 336),
    fileOffset: readU32Le(bytes, 340),
    fileSize: readU32Le(bytes, 344)
  };
}

export function parseMeta(bytes: Uint8Array, index: number): FwcMeta {
  if (bytes.byteLength < FWC_META_SIZE) {
    throw new Error(`META entry ${index} is too short`);
  }

  return {
    index,
    magic: asciiZ(bytes, 0, 8),
    name: asciiZ(bytes, 8, 72),
    partition: asciiZ(bytes, 72, 136),
    offset: readU32Le(bytes, 136),
    size: readU32Le(bytes, 140),
    crc: readU32Le(bytes, 144),
    ram: readU32Le(bytes, 148),
    attr: asciiZ(bytes, 152, 216),
    bytes: bytes.slice(0, FWC_META_SIZE)
  };
}

export function targetMetas(image: ParsedImage): FwcMeta[] {
  return image.metas.filter((meta) => meta.name.startsWith("image.target."));
}

export function componentBytes(image: ParsedImage, meta: FwcMeta): Uint8Array {
  const end = meta.offset + meta.size;
  if (end > image.bytes.byteLength) {
    throw new Error(
      `${meta.name} range out of bounds: offset=0x${meta.offset.toString(16)}, size=${meta.size}`
    );
  }
  return image.bytes.subarray(meta.offset, end);
}
