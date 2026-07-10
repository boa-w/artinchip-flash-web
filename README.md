# artinchip-flash-web

Browser-based ArtInChip firmware flasher using WebUSB.

This project is planned as a sibling of the native `artinchip-flash` Rust CLI/GUI.
The current milestone is a Chromium-compatible WebUSB flasher that can:

- request the ArtInChip upgrade device (`VID=0x33C3`, `PID=0x6677`);
- claim the bulk interface;
- send CBW/UPG commands;
- read `GET_HWINFO`;
- parse `.img` files in the browser;
- burn selected firmware components.

See [docs/architecture.md](docs/architecture.md) for the initial architecture.

Windows driver and permission setup is documented in
[docs/windows-webusb.md](docs/windows-webusb.md).

## Development

```sh
npm install
npm run dev
```

The local Vite dev server runs on localhost, which is a secure context for
WebUSB permission prompts.

## Validation

```sh
npm test
npm run build
```

## Cloudflare

This project is prepared for Cloudflare Workers Static Assets:

```sh
npm run cf:dev
npm run deploy
```

The Worker currently exposes:

- `/api/health`
- `/api/version`

Static frontend assets are produced by Vite into `dist/` and served by
Wrangler according to `wrangler.jsonc`.

Deployment details are in [docs/cloudflare-deploy.md](docs/cloudflare-deploy.md).

The recommended design for recent local images and optional cloud firmware
storage is documented in
[docs/image-history-storage.md](docs/image-history-storage.md).
