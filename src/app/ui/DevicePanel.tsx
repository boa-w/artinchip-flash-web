import { Cable, Info, PlugZap, Unplug } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { DeviceState } from "../state";

interface Props {
  device: DeviceState;
  onConnect: () => void;
  onReadInfo: () => void;
  onDisconnect: () => void;
}

export function DevicePanel({ device, onConnect, onReadInfo, onDisconnect }: Props) {
  const { t } = useTranslation();
  return (
    <section className="panel">
      <div className="panelHeader">
        <div>
          <h2>{t("device.title")}</h2>
          <p>{t("device.subtitle")}</p>
        </div>
        <span className={device.connected ? "status ok" : "status"} aria-live="polite">
          {device.connected ? t("device.connected") : t("device.disconnected")}
        </span>
      </div>

      {!device.supported && (
        <div className="notice warn">
          {t("unsupported")}
        </div>
      )}

      <div className="toolbar">
        <button type="button" onClick={onConnect} disabled={!device.supported || device.busy}>
          <PlugZap size={18} aria-hidden="true" />
          {t("device.connect")}
        </button>
        <button type="button" onClick={onReadInfo} disabled={!device.connected || device.busy}>
          <Info size={18} aria-hidden="true" />
          {t("device.readInfo")}
        </button>
        <button type="button" onClick={onDisconnect} disabled={!device.connected || device.busy}>
          <Unplug size={18} aria-hidden="true" />
          {t("device.disconnect")}
        </button>
      </div>

      <div className="kv">
        <span>{t("device.target")}</span>
        <strong>VID 0x33c3 / PID 0x6677</strong>
        <span>{t("device.selected")}</span>
        <strong>{device.label || t("device.none")}</strong>
      </div>

      <pre className="deviceInfo">
        {device.infoText || t("device.noInfo")}
      </pre>

      <div className="hint">
        <Cable size={16} aria-hidden="true" />
        {t("device.hint")}
      </div>
    </section>
  );
}
