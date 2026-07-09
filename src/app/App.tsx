import { useCallback, useRef, useState } from "react";
import { AicDevice } from "../device/AicDevice";
import { burnImage } from "../device/burnFlow";
import type { BurnEvent } from "../device/events";
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
  const [resetAfterBurn, setResetAfterBurn] = useState(true);
  const [overallProgress, setOverallProgress] = useState(0);
  const [componentProgress, setComponentProgress] = useState(0);
  const [activeComponent, setActiveComponent] = useState("");

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
      const aicDevice = new AicDevice(transport, (message) => log(message));
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
      log("Reading device information...");
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

  const applyBurnEvent = useCallback(
    (event: BurnEvent) => {
      switch (event.type) {
        case "log":
          log(event.message);
          break;
        case "stage":
          log(event.message);
          break;
        case "component-started":
          setActiveComponent(event.name);
          setComponentProgress(0);
          log(`Component ${event.name} partition=${event.partition || "-"} size=${event.size}`);
          break;
        case "component-progress":
          setActiveComponent(event.name);
          setComponentProgress(event.total > 0 ? event.sent / event.total : 0);
          break;
        case "overall-progress":
          setOverallProgress(event.total > 0 ? event.sent / event.total : 0);
          break;
        case "component-finished":
          log(`Component finished: ${event.name}`);
          break;
        case "finished":
          setOverallProgress(1);
          setComponentProgress(1);
          log("Burn completed successfully");
          break;
      }
    },
    [log]
  );

  const startBurn = useCallback(() => {
    void withBusy(async () => {
      const aicDevice = aicDeviceRef.current;
      const parsed = image.parsed;
      if (!aicDevice) {
        throw new Error("No connected ArtInChip device");
      }
      if (!parsed) {
        throw new Error("No firmware image selected");
      }
      const selected = image.selectedParts.join(", ") || "none";
      const ok = window.confirm(
        `This will burn selected firmware components to the connected ArtInChip board.\n\nImage: ${
          parsed.fileName ?? "selected image"
        }\nSelected parts: ${selected}\n\nContinue?`
      );
      if (!ok) {
        log("Burn cancelled by user", "warn");
        return;
      }

      setOverallProgress(0);
      setComponentProgress(0);
      setActiveComponent("");
      log("Starting burn...");

      for await (const event of burnImage(aicDevice, parsed, {
        selectedParts: image.selectedParts,
        resetAfterBurn,
        burnTimeoutMs: 60_000
      })) {
        applyBurnEvent(event);
      }
    });
  }, [applyBurnEvent, image.parsed, image.selectedParts, log, resetAfterBurn, withBusy]);

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
          <BurnPanel
            imageReady={Boolean(image.parsed)}
            deviceReady={device.connected}
            busy={device.busy}
            resetAfterBurn={resetAfterBurn}
            overallProgress={overallProgress}
            componentProgress={componentProgress}
            activeComponent={activeComponent}
            onResetAfterBurnChange={setResetAfterBurn}
            onBurn={startBurn}
          />
          <LogPanel logs={logs} onClear={() => setLogs([])} />
        </aside>
      </div>
    </main>
  );
}
