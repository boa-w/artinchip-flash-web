import type { UsbTransport } from "./UsbTransport";
import { UsbTransferError, UsbUnavailableError } from "./errors";

export const AIC_VENDOR_ID = 0x33c3;
export const AIC_PRODUCT_ID = 0x6677;
export const AIC_INTERFACE_NUMBER = 0;
export const AIC_BULK_OUT_ENDPOINT = 2;
export const AIC_BULK_IN_ENDPOINT = 1;

export function isWebUsbSupported(): boolean {
  return typeof navigator !== "undefined" && Boolean(navigator.usb);
}

export async function requestAicUsbDevice(): Promise<USBDevice> {
  if (!navigator.usb) {
    throw new UsbUnavailableError();
  }
  return navigator.usb.requestDevice({
    filters: [{ vendorId: AIC_VENDOR_ID, productId: AIC_PRODUCT_ID }]
  });
}

export async function getAuthorizedAicUsbDevices(): Promise<USBDevice[]> {
  if (!navigator.usb) {
    return [];
  }
  const devices = await navigator.usb.getDevices();
  return devices.filter(
    (device) => device.vendorId === AIC_VENDOR_ID && device.productId === AIC_PRODUCT_ID
  );
}

export class WebUsbTransport implements UsbTransport {
  constructor(private readonly device: USBDevice) {}

  get connected(): boolean {
    return this.device.opened;
  }

  get label(): string {
    const product = this.device.productName ?? "ArtInChip upgrade device";
    const serial = this.device.serialNumber ? ` ${this.device.serialNumber}` : "";
    return `${product}${serial}`;
  }

  async open(): Promise<void> {
    if (!this.device.opened) {
      await this.device.open();
    }
    if (!this.device.configuration) {
      await this.device.selectConfiguration(1);
    }
    await this.device.claimInterface(AIC_INTERFACE_NUMBER);
  }

  async close(): Promise<void> {
    if (!this.device.opened) {
      return;
    }
    try {
      await this.device.releaseInterface(AIC_INTERFACE_NUMBER);
    } catch {
      // Some devices disconnect during upgrade; closing should still proceed.
    }
    await this.device.close();
  }

  async transferOut(endpointNumber: number, data: Uint8Array): Promise<void> {
    const payload = new Uint8Array(data.byteLength);
    payload.set(data);
    const result = await this.device.transferOut(endpointNumber, payload.buffer);
    if (result.status !== "ok") {
      throw new UsbTransferError(`Bulk OUT stalled or failed: ${result.status}`);
    }
    if (result.bytesWritten !== data.byteLength) {
      throw new UsbTransferError(
        `Short bulk OUT write: ${result.bytesWritten}/${data.byteLength} bytes`
      );
    }
  }

  async transferIn(endpointNumber: number, length: number): Promise<Uint8Array> {
    const result = await this.device.transferIn(endpointNumber, length);
    if (result.status !== "ok") {
      throw new UsbTransferError(`Bulk IN stalled or failed: ${result.status}`);
    }
    if (!result.data) {
      return new Uint8Array();
    }
    return new Uint8Array(
      result.data.buffer.slice(result.data.byteOffset, result.data.byteOffset + result.data.byteLength)
    );
  }

  async clearHalt(direction: "in" | "out", endpointNumber: number): Promise<void> {
    await this.device.clearHalt(direction, endpointNumber);
  }
}
