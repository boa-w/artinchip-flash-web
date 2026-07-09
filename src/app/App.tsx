import { useCallback, useRef, useState } from "react";
import { AicDevice } from "../device/AicDevice";
import { parseImageFile } from "../image/parser";
import {
  getAuthorizedAicUsbDevices,
  isWebUsbSupported,
  requestAicUsbDevice,
  WebUsbTransport
} from "../transport/WebUsbTransport";
import "./styles.css";
import { BurnPanel } from "./ui/BurnPanel";
import { DevicePanel } from "./ui/DevicePanel";
import { ImagePanel } from "./ui/ImagePanel";
import { LogPanel } from "./ui/LogPanel";
import type { DeviceState, ImageState, LogEntry } from "./state";

const defaultParts = ["spl", "env", "os"];

function nowLabel(): string {
  return new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

export function App() {
  const aicDeviceRef = useRef<AicDevice | null>(null);
  const [device, setDevice] = useState<DeviceState>({
    supported: isWebUsbSupported(),
    connected: false,
    label: "",
    infoText: "",
    busy: false
  });
  const [image, setImage] = useState<ImageState>({
    parsed: null,
    selectedParts: defaultParts
  });
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const log = useCallback((message: string, level: LogEntry["level"] = "info") => {
    setLogs((current) => [
      ...current.slice(-299),
      {
        id: Date.now() + Math.random(),
        time: nowLabel(),
        level,
        message
      }
    ]);
  }, []);

  const withBusy = useCallback(
    async (task: () => Promise<void>) => {
      setDevice((current) => ({ ...current, busy: true }));
      try {
        await task();
      } catch (error) {
        log(error instanceof Error ? error.message : String(error), "error");
      } finally {
        setDevice((current) => ({ ...current, busy: false }));
      }
    },
    [log]
  );

  const connect = useCallback(() => {
    void withBusy(async () => {
      const authorizedDevices = await getAuthorizedAicUsbDevices();
      const usbDevice = authorizedDevices[0] ?? (await requestAicUsbDevice());
      if (authorizedDevices[0]) {
        log("Using previously paired ArtInChip device");
      }
      const transport = new WebUsbTransport(usbDevice);
      const aicDevice = new AicDevice(transport);
      await aicDevice.open();
      aicDeviceRef.current = aicDevice;
      setDevice((current) => ({
        ...current,
        connected: true,
        label: transport.label,
        infoText: current.infoText
      }));
      log(`Connected to ${transport.label}`);
    });
  }, [log, withBusy]);

  const readInfo = useCallback(() => {
    void withBusy(async () => {
      const aicDevice = aicDeviceRef.current;
      if (!aicDevice) {
        throw new Error("No connected ArtInChip device");
      }
      const infoText = await aicDevice.deviceInfoText();
      setDevice((current) => ({ ...current, infoText }));
      log("Device information read successfully");
    });
  }, [log, withBusy]);

  const disconnect = useCallback(() => {
    void withBusy(async () => {
      await aicDeviceRef.current?.close();
      aicDeviceRef.current = null;
      setDevice((current) => ({
        ...current,
        connected: false,
        label: "",
        infoText: ""
      }));
      log("Disconnected");
    });
  }, [log, withBusy]);

  const loadFile = useCallback(
    (file: File) => {
      void (async () => {
        try {
          const parsed = await parseImageFile(file);
          const selectedParts = parsed.metas
            .filter((meta) => meta.name.startsWith("image.target."))
            .map((meta) => meta.name.replace(/^image\.target\./, ""))
            .filter((part) => defaultParts.includes(part));
          setImage({
            parsed,
            selectedParts: selectedParts.length > 0 ? selectedParts : defaultParts
          });
          log(`Parsed ${file.name}: ${parsed.metas.length} component(s), ${parsed.totalSize.toLocaleString()} bytes`);
        } catch (error) {
          log(error instanceof Error ? error.message : String(error), "error");
        }
      })();
    },
    [log]
  );

  const togglePart = useCallback((part: string) => {
    setImage((current) => ({
      ...current,
      selectedParts: current.selectedParts.includes(part)
        ? current.selectedParts.filter((item) => item !== part)
        : [...current.selectedParts, part]
    }));
  }, []);

  return (
    <main className="appShell">
      <header className="appHeader">
        <div>
          <h1>ArtInChip WebUSB Flasher</h1>
          <p>Local browser flashing workspace for Chromium-compatible WebUSB.</p>
        </div>
        <div className="versionBadge">M1 POC</div>
      </header>

      <div className="workspace">
        <div className="mainColumn">
          <DevicePanel
            device={device}
            onConnect={connect}
            onReadInfo={readInfo}
            onDisconnect={disconnect}
          />
          <ImagePanel image={image} onFile={loadFile} onTogglePart={togglePart} />
        </div>
        <aside className="sideColumn">
          <BurnPanel imageReady={Boolean(image.parsed)} deviceReady={device.connected} />
          <LogPanel logs={logs} onClear={() => setLogs([])} />
        </aside>
      </div>
    </main>
  );
}
