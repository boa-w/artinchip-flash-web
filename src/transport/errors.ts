export class UsbUnavailableError extends Error {
  constructor() {
    super("WebUSB is not available in this browser. Use Chrome or Edge over HTTPS/localhost.");
    this.name = "UsbUnavailableError";
  }
}

export class UsbTransferError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UsbTransferError";
  }
}

export class UsbAccessDeniedError extends Error {
  constructor(action: string, cause?: unknown) {
    const detail = cause instanceof Error ? ` Original error: ${cause.message}` : "";
    super(
      `${action} was denied. Close AiBurn/aic-flash/other USB tools, then make sure the device interface uses a WinUSB-compatible driver.${detail}`
    );
    this.name = "UsbAccessDeniedError";
  }
}

export function isAccessDenied(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return /access denied|denied|not allowed|permission/i.test(error.message);
}
