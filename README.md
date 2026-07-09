# artinchip-flash-web

Browser-based ArtInChip firmware flasher using WebUSB.

This project is planned as a sibling of the native `artinchip-flash` Rust CLI/GUI.
The first milestone is a Chromium-compatible WebUSB proof of concept that can:

- request the ArtInChip upgrade device (`VID=0x33C3`, `PID=0x6677`);
- claim the bulk interface;
- send CBW/UPG commands;
- read `GET_HWINFO`;
- parse `.img` files in the browser.

See [docs/architecture.md](docs/architecture.md) for the initial architecture.
