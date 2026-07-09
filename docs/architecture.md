# artinchip-flash-web Architecture

## Goal

Build a browser-based ArtInChip firmware flasher around WebUSB while keeping the
protocol model close to the native Rust `artinchip-flash` project.

The web version should start as an independent TypeScript project. Shared Rust
or WASM code can be considered later after the WebUSB path is proven on real
hardware.

## Non-Goals For The First Milestone

- Do not port the existing egui desktop UI.
- Do not compile the whole Rust project to WASM.
- Do not support Firefox or Safari unless they gain WebUSB support.
- Do not implement official `upgcmd` compatibility commands before core burn
  and device-info flows are reliable.

## Runtime Constraints

WebUSB requires:

- Chromium-family browser support.
- HTTPS or localhost secure context.
- User gesture for `navigator.usb.requestDevice`.
- A driver/interface state that lets the browser claim interface `0`.

Expected device:

- VID: `0x33C3`
- PID: `0x6677`
- OUT endpoint: `0x02`
- IN endpoint: `0x81`
- Interface: `0`
- Transfer style: bulk CBW/CSW with UPG command payloads.

## Proposed Stack

- TypeScript for protocol, image parsing, and burn orchestration.
- Vite for local development and static build.
- Vitest for pure parser/protocol unit tests.
- Plain WebUSB APIs for device transport.
- A restrained single-page app UI. No backend is required.

## Module Layout

```text
src/
  app/
    App.tsx or App.ts
    state.ts
    ui/
      DevicePanel.tsx
      ImagePanel.tsx
      BurnPanel.tsx
      LogPanel.tsx

  image/
    parser.ts
    types.ts
    parser.test.ts

  protocol/
    cbwCsw.ts
    upgHeaders.ts
    commands.ts
    types.ts
    protocol.test.ts

  transport/
    UsbTransport.ts
    WebUsbTransport.ts
    errors.ts

  device/
    AicDevice.ts
    burnFlow.ts
    events.ts
    componentPlan.ts

  util/
    crc32.ts
    bytes.ts
    sleep.ts
```

The names can be adjusted during implementation, but the boundaries should stay
stable:

- `image` has no browser USB dependency.
- `protocol` has no browser USB dependency.
- `transport` knows WebUSB but not firmware image semantics.
- `device` combines protocol commands with a transport.
- `app` owns UI state, user gestures, file selection, and logs.

## Core Interfaces

### UsbTransport

```ts
export interface UsbTransport {
  readonly connected: boolean;
  open(): Promise<void>;
  close(): Promise<void>;
  transferOut(endpointNumber: number, data: Uint8Array): Promise<void>;
  transferIn(endpointNumber: number, length: number): Promise<Uint8Array>;
  clearHalt?(direction: "in" | "out", endpointNumber: number): Promise<void>;
}
```

`WebUsbTransport` will wrap `USBDevice` and hide browser-specific result
objects from the protocol layer.

### AicDevice

`AicDevice` should mirror the native Rust `AicDevice` behavior, but use async
methods:

```ts
class AicDevice {
  getHwInfo(): Promise<HwInfo>;
  getStorageMedia(): Promise<string>;
  setUpgradeConfig(mode: UpgradeMode): Promise<void>;
  burnImage(image: ParsedImage, options: BurnOptions): AsyncIterable<BurnEvent>;
  reset(): Promise<void>;
}
```

The initial device-info milestone only needs `getHwInfo`.

## Protocol Migration Map

Native Rust source:

- `src/protocol/cbw_csw.rs` -> `src/protocol/cbwCsw.ts`,
  `src/protocol/upgHeaders.ts`
- `src/protocol/commands.rs` -> `src/protocol/commands.ts`
- `src/image/parser.rs` -> `src/image/parser.ts`
- selected methods from `src/usb/device.rs` -> `src/device/AicDevice.ts` and
  `src/device/burnFlow.ts`

Important behavior to preserve:

- CBW is 31 bytes.
- CSW is 13 bytes.
- UPG command header is 16 bytes.
- Command checksum is:
  `magic + (reserved << 24 | cmd << 16 | version << 8 | protocol) + dataLength`.
- Bulk writes must support chunking. Start with 64 KiB chunks and tune after
  hardware testing.
- Reads should accumulate until the requested length is satisfied, because a
  WebUSB bulk transfer may return less than requested.

## Burn Flow Phases

Target full flow:

1. Parse selected `.img`.
2. Build component plan:
   - updater components first;
   - `image.info`;
   - selected `image.target.*` components;
   - other required metadata as discovered.
3. Connect and read device info.
4. Set `FULL_DISK_UPGRADE`.
5. Send updater stage if present.
6. Handle device reconnect.
7. Send image info.
8. Send selected target components.
9. End upgrade.
10. Optionally reset.

The WebUSB reconnect phase needs specific hardware validation. It should listen
for `navigator.usb` `disconnect` and `connect` events, then reopen and claim
the interface again.

## Milestones

### M0 - Project Skeleton

- Initialize git repository.
- Add architecture document.
- Choose TypeScript/Vite structure.

### M1 - WebUSB Device Info

- Scaffold Vite app.
- Implement `WebUsbTransport`.
- Implement CBW/CSW and UPG header builders.
- Implement `GET_HWINFO`.
- Verify on real hardware.

### M2 - Image Parser

- Implement `.img` header and META parser.
- Add tests with synthetic fixtures.
- Show image summary and component table in UI.

### M3 - Burn Flow

- Implement selected component plan.
- Implement `SET_UPG_CFG`, `SET_FWC_META`, `GET_BLOCK_SIZE`,
  `SEND_FWC_DATA`, `SET_UPG_END`, and `RESET`.
- Add progress events and cancellation guard.
- Validate one full burn with logs preserved.

### M4 - Hardening

- Reconnect handling.
- Clear-halt and stale IN endpoint drain behavior.
- Better browser/driver diagnostics.
- Import/export logs.
- Release build and deployment instructions.

## Testing Strategy

- Unit test byte-level protocol builders with known byte arrays from the Rust
  tests.
- Unit test image parsing with generated fixtures.
- Keep hardware tests manual at first because WebUSB requires browser permission
  and physical device state.
- Save successful hardware logs under `docs/hardware-notes/` when available.

## Open Questions

- Does the updater phase always reconnect with the same VID/PID?
- Does Chrome keep permission after the updater reconnect, or must the user
  grant access again?
- What maximum `transferOut` size is reliable across Windows, macOS, Linux,
  and Chrome versions?
- Does `clearHalt` work consistently for this device in WebUSB?
- Are there cases where endpoint numbers must be discovered from descriptors
  instead of hardcoded?
