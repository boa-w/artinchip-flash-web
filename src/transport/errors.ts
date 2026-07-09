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
