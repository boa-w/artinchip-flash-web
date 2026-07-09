import { CheckCircle2, Flame, RotateCcw } from "lucide-react";
import { useTranslation } from "react-i18next";

export interface BurnSummary {
  imageName: string;
  componentCount: number;
  selectedParts: string;
  resetAfterBurn: boolean;
  durationMs: number;
}

interface Props {
  imageReady: boolean;
  deviceReady: boolean;
  busy: boolean;
  disabledReason: string;
  resetAfterBurn: boolean;
  verboseLog: boolean;
  overallProgress: number;
  componentProgress: number;
  activeComponent: string;
  summary: BurnSummary | null;
  onResetAfterBurnChange: (value: boolean) => void;
  onVerboseLogChange: (value: boolean) => void;
  onBurn: () => void;
}

export function BurnPanel({
  imageReady,
  deviceReady,
  busy,
  disabledReason,
  resetAfterBurn,
  verboseLog,
  overallProgress,
  componentProgress,
  activeComponent,
  summary,
  onResetAfterBurnChange,
  onVerboseLogChange,
  onBurn
}: Props) {
  const { t } = useTranslation();
  const ready = imageReady && deviceReady && !busy;

  return (
    <section className="panel burnPanel">
      <div className="panelHeader">
        <div>
          <h2>{t("burn.title")}</h2>
          <p>{t("burn.subtitle")}</p>
        </div>
      </div>

      <label className="toggleRow">
        <input
          type="checkbox"
          checked={resetAfterBurn}
          onChange={(event) => onResetAfterBurnChange(event.currentTarget.checked)}
        />
        <span>
          <RotateCcw size={17} aria-hidden="true" />
          {t("burn.resetAfterBurn")}
        </span>
      </label>

      <label className="toggleRow">
        <input
          type="checkbox"
          checked={verboseLog}
          onChange={(event) => onVerboseLogChange(event.currentTarget.checked)}
        />
        <span>{t("burn.verboseLog")}</span>
      </label>

      <div className="progressBlock">
        <div className="progressHeader">
          <span>{t("burn.overall")}</span>
          <strong>{Math.round(overallProgress * 100)}%</strong>
        </div>
        <progress value={overallProgress} max={1} />
      </div>

      <div className="progressBlock">
        <div className="progressHeader">
          <span>{activeComponent || t("burn.component")}</span>
          <strong>{Math.round(componentProgress * 100)}%</strong>
        </div>
        <progress value={componentProgress} max={1} />
      </div>

      <button type="button" disabled={!ready} className="primaryAction" onClick={onBurn}>
        <Flame size={18} aria-hidden="true" />
        {t("burn.burnSelected")}
      </button>

      {!ready && <div className="disabledReason">{disabledReason}</div>}

      {summary && (
        <div className="burnSummary">
          <div className="summaryTitle">
            <CheckCircle2 size={18} aria-hidden="true" />
            <strong>{t("burn.summaryTitle")}</strong>
          </div>
          <dl>
            <div>
              <dt>{t("burn.summaryImage")}</dt>
              <dd>{summary.imageName}</dd>
            </div>
            <div>
              <dt>{t("burn.summaryComponents")}</dt>
              <dd>{summary.componentCount}</dd>
            </div>
            <div>
              <dt>{t("burn.summaryParts")}</dt>
              <dd>{summary.selectedParts}</dd>
            </div>
            <div>
              <dt>{t("burn.summaryReset")}</dt>
              <dd>{summary.resetAfterBurn ? t("common.yes") : t("common.no")}</dd>
            </div>
            <div>
              <dt>{t("burn.summaryDuration")}</dt>
              <dd>{formatDuration(summary.durationMs)}</dd>
            </div>
          </dl>
        </div>
      )}
    </section>
  );
}

function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes > 0 ? `${minutes}m ${rest}s` : `${rest}s`;
}
