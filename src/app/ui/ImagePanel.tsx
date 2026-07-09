import { FileUp } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ImageState } from "../state";

interface Props {
  image: ImageState;
  onFile: (file: File) => void;
  onTogglePart: (part: string) => void;
}

export function ImagePanel({ image, onFile, onTogglePart }: Props) {
  const { t } = useTranslation();
  const parsed = image.parsed;
  const targetMetas = parsed?.metas.filter((meta) => meta.name.startsWith("image.target.")) ?? [];

  return (
    <section className="panel imagePanel">
      <div className="panelHeader">
        <div>
          <h2>{t("image.title")}</h2>
          <p>{t("image.subtitle")}</p>
        </div>
        <label className="fileButton">
          <FileUp size={18} aria-hidden="true" />
          {t("image.selectFile")}
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
              <span>{t("image.file")}</span>
              <strong>{parsed.fileName ?? t("image.selectedImage")}</strong>
            </div>
            <div>
              <span>{t("image.platform")}</span>
              <strong>{parsed.header.platform || "-"}</strong>
            </div>
            <div>
              <span>{t("image.product")}</span>
              <strong>{parsed.header.product || "-"}</strong>
            </div>
            <div>
              <span>{t("image.version")}</span>
              <strong>{parsed.header.version || "-"}</strong>
            </div>
            <div>
              <span>{t("image.media")}</span>
              <strong>{parsed.header.mediaType || "-"}</strong>
            </div>
            <div>
              <span>{t("image.components")}</span>
              <strong>{parsed.metas.length}</strong>
            </div>
          </div>

          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>{t("image.use")}</th>
                  <th>{t("image.name")}</th>
                  <th>{t("image.partition")}</th>
                  <th>{t("image.size")}</th>
                  <th>{t("image.crc")}</th>
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
                            aria-label={t("image.select", { name: meta.name })}
                          />
                        ) : (
                          <span className="fixedUse">{t("image.auto")}</span>
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
            <div className="notice">{t("image.noTarget")}</div>
          )}
        </>
      ) : (
        <div className="empty">{t("image.empty")}</div>
      )}
    </section>
  );
}
