export interface FwHeader {
  magic: string;
  platform: string;
  product: string;
  version: string;
  mediaType: string;
  mediaDevId: number;
  mediaId: string;
  metaOffset: number;
  metaSize: number;
  fileOffset: number;
  fileSize: number;
}

export interface FwcMeta {
  index: number;
  magic: string;
  name: string;
  partition: string;
  offset: number;
  size: number;
  crc: number;
  ram: number;
  attr: string;
  bytes: Uint8Array;
}

export interface ParsedImage {
  fileName?: string;
  totalSize: number;
  header: FwHeader;
  metas: FwcMeta[];
  bytes: Uint8Array;
}
