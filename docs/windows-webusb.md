# Windows WebUSB Setup

This guide covers the Windows-specific setup needed for Chrome or Edge to open
the ArtInChip upgrade device through WebUSB.

## Requirements

- Chrome or Edge.
- The page must be served from `https://` or `localhost`.
- The ArtInChip board must be in upgrade mode.
- The active USB driver for `VID_33C3&PID_6677` must be WinUSB.
- Native tools such as AiBurn or `aic-flash` must be closed while the browser is
  using the device.

## Check The Current Driver

Run PowerShell:

```powershell
Get-PnpDevice -PresentOnly |
  Where-Object { $_.InstanceId -match 'VID_33C3&PID_6677' } |
  Format-List FriendlyName,InstanceId,Service,Status
```

For WebUSB, the important value is:

```text
Service : WinUSB
```

If it shows `libusbK`, the native Rust tool can still work, but Chrome WebUSB
may fail with:

```text
Failed to execute 'open' on 'USBDevice': Access denied.
```

## Switch To WinUSB

The native `aic-flash install-usb-access` command writes a WinUSB INF to:

```text
%APPDATA%\aic-flash\driver\aic-winusb.inf
```

If Windows keeps using an older `libusbK` binding, update the device manually:

1. Open Device Manager.
2. Find `Artinchip SoC` or `Artinchip Device`.
3. Right click, then choose **Update driver**.
4. Choose **Browse my computer for drivers**.
5. Choose **Let me pick from a list of available drivers on my computer**.
6. Choose **Have Disk**.
7. Select:

   ```text
   %APPDATA%\aic-flash\driver\aic-winusb.inf
   ```

8. Replug the board and enter upgrade mode again.

Zadig can also be used to switch `33C3:6677` to WinUSB. After switching, replug
the board before retrying WebUSB.

## Browser Permission Reset

If Chrome or Edge remembers a bad permission state:

1. Open the flasher page.
2. Click the icon at the left side of the address bar.
3. Open site settings.
4. Remove USB device permissions.
5. Refresh the page and click **Connect** again.

## Troubleshooting

### The Device Appears, But Connect Fails

Check:

- The active driver is WinUSB, not libusbK.
- AiBurn, native `aic-flash`, and other USB tools are closed.
- The board is still in upgrade mode.
- The page is opened from `https://` or `http://localhost`.

### Burn Reaches Updater Reconnect And Stops

The updater stage may cause the board to disconnect and enumerate again. The
browser can only reopen it if permission remains available. If reconnect fails:

- Replug the board.
- Click **Connect** again.
- Enable **Verbose protocol log** and retry to capture reconnect details.

### Native Tool Works But WebUSB Does Not

This usually means the device is bound to a libusb-compatible driver such as
`libusbK`. The native Rust tool can access that path, but WebUSB on Windows
needs a WinUSB-compatible device interface.
