import type { UsbTransport } from "./UsbTransport";
import {
  isAccessDenied,
  UsbAccessDeniedError,
  UsbTransferError,
  UsbUnavailableError
} from "./errors";

export const AIC_VENDOR_ID = 0x33c3;
export const AIC_PRODUCT_ID = 0x6677;
export const AIC_INTERFACE_NUMBER = 0;
export const AIC_BULK_OUT_ENDPOINT = 2;
export const AIC_BULK_IN_ENDPOINT = 1;
const OPEN_TIMEOUT_MS = 5_000;
const RECONNECT_POLL_MS = 250;
const RECONNECT_SETTLE_MS = 120;

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
  constructor(private device: USBDevice) {}

  get connected(): boolean {
    return this.device.opened;
  }

  get label(): string {
    const product = this.device.productName ?? "ArtInChip upgrade device";
    const serial = this.device.serialNumber ? ` ${this.device.serialNumber}` : "";
    return `${product}${serial}`;
  }

  async open(): Promise<void> {
    try {
      if (!this.device.opened) {
        await withTimeout(this.device.open(), "USB open", OPEN_TIMEOUT_MS);
      }
      if (!this.device.configuration) {
        await withTimeout(
          this.device.selectConfiguration(1),
          "USB selectConfiguration",
          OPEN_TIMEOUT_MS
        );
      }
      await withTimeout(
        this.device.claimInterface(AIC_INTERFACE_NUMBER),
        "USB claimInterface",
        OPEN_TIMEOUT_MS
      );
    } catch (error) {
      if (isAccessDenied(error)) {
        throw new UsbAccessDeniedError("Opening the ArtInChip USB device", error);
      }
      throw error;
    }
  }

  async close(): Promise<void> {
    if (!this.device.opened) {
      return;
    }
    try {
      await withTimeout(
        this.device.releaseInterface(AIC_INTERFACE_NUMBER),
        "USB releaseInterface",
        OPEN_TIMEOUT_MS
      );
    } catch {
      // Some devices disconnect during upgrade; closing should still proceed.
    }
    await withTimeout(this.device.close(), "USB close", OPEN_TIMEOUT_MS).catch(() => undefined);
  }

  async waitReconnect(timeoutMs: number, onTrace?: (message: string) => void): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    let lastError = "";

    await this.close().catch((error: unknown) => {
      lastError = error instanceof Error ? error.message : String(error);
    });

    // Give the updater a moment to drop the old USB instance before polling.
    await sleep(RECONNECT_POLL_MS);

    while (Date.now() < deadline) {
      const devices = await getAuthorizedAicUsbDevices();
      onTrace?.(`Reconnect poll: ${devices.length} authorized ArtInChip device(s)`);

      for (const candidate of devices) {
        this.device = candidate;
        try {
          await this.open();
          await sleep(RECONNECT_SETTLE_MS);
          onTrace?.("Reconnected through WebUSB");
          return;
        } catch (error) {
          lastError = error instanceof Error ? error.message : String(error);
          onTrace?.(`Reconnect candidate failed: ${lastError}`);
        }
      }

      await sleep(RECONNECT_POLL_MS);
    }

    throw new Error(
      lastError ||
        "Timed out waiting for the ArtInChip device to reconnect. If the browser permission was lost, reconnect the board and click Connect again."
    );
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

async function withTimeout<T>(promise: Promise<T>, label: string, timeoutMs: number): Promise<T> {
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
