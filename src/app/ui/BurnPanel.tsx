import { Flame, RotateCcw } from "lucide-react";
import { useTranslation } from "react-i18next";

interface Props {
  imageReady: boolean;
  deviceReady: boolean;
  busy: boolean;
  resetAfterBurn: boolean;
  overallProgress: number;
  componentProgress: number;
  activeComponent: string;
  onResetAfterBurnChange: (value: boolean) => void;
  onBurn: () => void;
}

export function BurnPanel({
  imageReady,
  deviceReady,
  busy,
  resetAfterBurn,
  overallProgress,
  componentProgress,
  activeComponent,
  onResetAfterBurnChange,
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
    </section>
  );
}
