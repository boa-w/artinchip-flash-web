import { Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { LogEntry } from "../state";

interface Props {
  logs: LogEntry[];
  onClear: () => void;
}

export function LogPanel({ logs, onClear }: Props) {
  const { t } = useTranslation();
  return (
    <section className="panel logPanel">
      <div className="panelHeader compact">
        <div>
          <h2>{t("log.title")}</h2>
        </div>
        <button type="button" onClick={onClear} disabled={logs.length === 0} title={t("log.clear")}>
          <Trash2 size={18} aria-hidden="true" />
          {t("log.clear")}
        </button>
      </div>
      <div className="logStream" role="log" aria-live="polite">
        {logs.length === 0 ? (
          <div className="empty">{t("log.empty")}</div>
        ) : (
          logs.map((entry) => (
            <div className={`logLine ${entry.level}`} key={entry.id}>
              <span>{entry.time}</span>
              <strong>{entry.level}</strong>
              <p>{entry.message}</p>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
