import { Trash2 } from "lucide-react";
import type { LogEntry } from "../state";

interface Props {
  logs: LogEntry[];
  onClear: () => void;
}

export function LogPanel({ logs, onClear }: Props) {
  return (
    <section className="panel logPanel">
      <div className="panelHeader compact">
        <div>
          <h2>Log</h2>
        </div>
        <button type="button" onClick={onClear} disabled={logs.length === 0} title="Clear log">
          <Trash2 size={18} aria-hidden="true" />
          Clear
        </button>
      </div>
      <div className="logStream" role="log" aria-live="polite">
        {logs.length === 0 ? (
          <div className="empty">No log entries yet.</div>
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
