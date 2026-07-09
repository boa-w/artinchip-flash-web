# Cloudflare Deployment

The project is prepared for Cloudflare Workers Static Assets. The frontend is
built by Vite into `dist/`, and `wrangler.jsonc` serves those assets with a
small Worker API.

## Local Validation

```sh
npm test
npm run build
npx wrangler deploy --dry-run
```

## Local Cloudflare Runtime

```sh
npm run cf:dev
```

This builds the frontend and starts Wrangler's local Workers runtime.

## Deploy

Log in once:

```sh
npx wrangler login
```

Deploy:

```sh
npm run deploy
```

The Worker currently exposes:

- `/api/health`
- `/api/version`

The flasher itself is a browser-local WebUSB app. Firmware files are parsed and
sent to the board from the user's machine; they are not uploaded to Cloudflare.

## Custom Domain

After the first deployment, add a route or custom domain in the Cloudflare
dashboard for the deployed Worker. WebUSB requires a secure context, so use
HTTPS in production.

## Future Storage

If official firmware catalogs are needed later, use:

- R2 for firmware objects.
- D1 or KV for release metadata.
- Worker API routes for manifests.

Keep user-selected local firmware flashing independent from server storage.
