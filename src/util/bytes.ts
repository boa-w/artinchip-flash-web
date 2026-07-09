export function readU32Le(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(
    offset,
    true
  );
}

export function writeU32Le(bytes: Uint8Array, offset: number, value: number): void {
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setUint32(
    offset,
    value >>> 0,
    true
  );
}

export function asciiZ(bytes: Uint8Array, start: number, end: number): string {
  const slice = bytes.subarray(start, end);
  let len = slice.indexOf(0);
  if (len < 0) {
    len = slice.length;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(slice.subarray(0, len)).trimEnd();
}

export function concatBytes(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.byteLength;
  }
  return out;
}

export function hex32(value: number): string {
  return `0x${(value >>> 0).toString(16).padStart(8, "0")}`;
}

export function hex16(value: number): string {
  return `0x${(value & 0xffff).toString(16).padStart(4, "0")}`;
}
