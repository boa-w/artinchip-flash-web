import { FileUp } from "lucide-react";
import type { ImageState } from "../state";

interface Props {
  image: ImageState;
  onFile: (file: File) => void;
  onTogglePart: (part: string) => void;
}

export function ImagePanel({ image, onFile, onTogglePart }: Props) {
  const parsed = image.parsed;
  const targetMetas = parsed?.metas.filter((meta) => meta.name.startsWith("image.target.")) ?? [];

  return (
    <section className="panel imagePanel">
      <div className="panelHeader">
        <div>
          <h2>Image</h2>
          <p>Parse firmware locally in the browser</p>
        </div>
        <label className="fileButton">
          <FileUp size={18} aria-hidden="true" />
          Select .img
          <input
            type="file"
            accept=".img,application/octet-stream"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (file) {
                onFile(file);
              }
              event.currentTarget.value = "";
            }}
          />
        </label>
      </div>

      {parsed ? (
        <>
          <div className="summaryGrid">
            <div>
              <span>File</span>
              <strong>{parsed.fileName ?? "Selected image"}</strong>
            </div>
            <div>
              <span>Platform</span>
              <strong>{parsed.header.platform || "-"}</strong>
            </div>
            <div>
              <span>Product</span>
              <strong>{parsed.header.product || "-"}</strong>
            </div>
            <div>
              <span>Version</span>
              <strong>{parsed.header.version || "-"}</strong>
            </div>
            <div>
              <span>Media</span>
              <strong>{parsed.header.mediaType || "-"}</strong>
            </div>
            <div>
              <span>Components</span>
              <strong>{parsed.metas.length}</strong>
            </div>
          </div>

          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>Use</th>
                  <th>Name</th>
                  <th>Partition</th>
                  <th>Size</th>
                  <th>CRC</th>
                </tr>
              </thead>
              <tbody>
                {parsed.metas.map((meta) => {
                  const key = meta.name.replace(/^image\.target\./, "");
                  const selectable = meta.name.startsWith("image.target.");
                  const checked = image.selectedParts.includes(key) || image.selectedParts.includes(meta.partition);
                  return (
                    <tr key={`${meta.index}-${meta.name}`}>
                      <td>
                        {selectable ? (
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => onTogglePart(key)}
                            aria-label={`Select ${meta.name}`}
                          />
                        ) : (
                          <span className="fixedUse">Auto</span>
                        )}
                      </td>
                      <td>{meta.name}</td>
                      <td>{meta.partition || "-"}</td>
                      <td>{meta.size.toLocaleString()}</td>
                      <td>0x{meta.crc.toString(16).padStart(8, "0")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {targetMetas.length === 0 && (
            <div className="notice">No image.target.* components found in this image.</div>
          )}
        </>
      ) : (
        <div className="empty">Select an ArtInChip `.img` file to inspect its header and META entries.</div>
      )}
    </section>
  );
}
