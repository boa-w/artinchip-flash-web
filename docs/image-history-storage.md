# Image History And Storage

Browsers intentionally do not expose reusable local file paths. An image
history entry therefore cannot be implemented by saving a Windows path in
`localStorage`.

## Recommended Local History

Use IndexedDB with the File System Access API on Chromium browsers.

Store one record per recently selected image:

```ts
interface ImageHistoryRecord {
  id: string;
  name: string;
  size: number;
  lastModified: number;
  platform: string;
  product: string;
  version: string;
  mediaType: string;
  selectedParts: string[];
  lastOpenedAt: number;
  handle?: FileSystemFileHandle;
}
```

The file handle can be stored directly in IndexedDB. On a later visit:

1. Read history records from IndexedDB.
2. Call `handle.queryPermission({ mode: "read" })`.
3. If needed, call `handle.requestPermission({ mode: "read" })` from a user click.
4. Call `handle.getFile()` and parse the returned `File` again.
5. If permission is unavailable, keep the metadata entry and show a **Relocate**
   action so the user can select the file again.

Use `window.showOpenFilePicker()` when available because it returns a reusable
`FileSystemFileHandle`. Keep the existing `<input type="file">` as the fallback;
the fallback can save metadata but cannot reopen the file automatically.

## Do Not Store Large Images In localStorage

`localStorage` is synchronous and usually limited to a few megabytes. It is
appropriate only for small preferences such as language, reset-after-burn, and
the selected partition list.

If the application must keep a complete local copy of an image, store the Blob
in IndexedDB or OPFS. This should be opt-in because firmware images can consume
significant browser storage. Check storage quota through:

```ts
await navigator.storage.estimate();
```

## Cloudflare Storage

User-selected local images should remain local by default. For official or
shared firmware:

- Store firmware objects in Cloudflare R2.
- Store release metadata in D1 or KV.
- Return a signed or controlled download URL from the Worker API.
- Verify size and CRC after download before enabling Burn.

Keep local history and the official cloud catalog as separate concepts:

- **Recent images**: local IndexedDB records and file handles.
- **Official firmware**: server-provided catalog backed by R2.

## Suggested UI

Add a **Recent images** menu next to **Select .img**. Each row should show file
name, product/version, size, last-used time, and one of these states:

- Ready: the stored file handle still has permission.
- Permission required: clicking the row requests permission.
- Missing: offer Relocate or Remove.

Limit history to 10-20 records and provide a Clear history command.
