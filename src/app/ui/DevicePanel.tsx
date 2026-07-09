import { Cable, Info, PlugZap, Unplug } from "lucide-react";
import type { DeviceState } from "../state";

interface Props {
  device: DeviceState;
  onConnect: () => void;
  onReadInfo: () => void;
  onDisconnect: () => void;
}

export function DevicePanel({ device, onConnect, onReadInfo, onDisconnect }: Props) {
  return (
    <section className="panel">
      <div className="panelHeader">
        <div>
          <h2>Device</h2>
          <p>ArtInChip upgrade device over WebUSB</p>
        </div>
        <span className={device.connected ? "status ok" : "status"} aria-live="polite">
          {device.connected ? "Connected" : "Disconnected"}
        </span>
      </div>

      {!device.supported && (
        <div className="notice warn">
          WebUSB is unavailable. Use Chrome or Edge over HTTPS or localhost.
        </div>
      )}

      <div className="toolbar">
        <button type="button" onClick={onConnect} disabled={!device.supported || device.busy}>
          <PlugZap size={18} aria-hidden="true" />
          Connect
        </button>
        <button type="button" onClick={onReadInfo} disabled={!device.connected || device.busy}>
          <Info size={18} aria-hidden="true" />
          Read Info
        </button>
        <button type="button" onClick={onDisconnect} disabled={!device.connected || device.busy}>
          <Unplug size={18} aria-hidden="true" />
          Disconnect
        </button>
      </div>

      <div className="kv">
        <span>Target</span>
        <strong>VID 0x33c3 / PID 0x6677</strong>
        <span>Selected</span>
        <strong>{device.label || "None"}</strong>
      </div>

      <pre className="deviceInfo">
        {device.infoText || "No device information read yet."}
      </pre>

      <div className="hint">
        <Cable size={16} aria-hidden="true" />
        The browser can only access the board after a user-triggered permission prompt.
      </div>
    </section>
  );
}
