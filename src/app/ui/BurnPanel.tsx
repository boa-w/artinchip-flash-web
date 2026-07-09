import { Flame, ShieldAlert } from "lucide-react";

interface Props {
  imageReady: boolean;
  deviceReady: boolean;
}

export function BurnPanel({ imageReady, deviceReady }: Props) {
  const readyForFutureBurn = imageReady && deviceReady;

  return (
    <section className="panel burnPanel">
      <div className="panelHeader">
        <div>
          <h2>Burn</h2>
          <p>Full burn flow is intentionally gated during hardware validation</p>
        </div>
      </div>

      <div className="notice warn">
        <ShieldAlert size={18} aria-hidden="true" />
        The first hardware milestone is device info. Enable full burn only after GET_HWINFO,
        endpoint recovery, and reconnect behavior are verified on the target board.
      </div>

      <button type="button" disabled={!readyForFutureBurn} className="primaryAction">
        <Flame size={18} aria-hidden="true" />
        Burn disabled for POC
      </button>
    </section>
  );
}
