import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
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
import { FlowStatus, type FlowStep } from "./ui/FlowStatus";
import { ImagePanel } from "./ui/ImagePanel";
import { LanguageSwitcher } from "./ui/LanguageSwitcher";
import { LogPanel } from "./ui/LogPanel";
import type { DeviceState, ImageState, LogEntry } from "./state";
import type { BurnSummary } from "./ui/BurnPanel";

const defaultParts = ["spl", "env", "os"];

function nowLabel(): string {
  return new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

export function App() {
  const { t } = useTranslation();
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
  const [verboseLog, setVerboseLog] = useState(false);
  const verboseLogRef = useRef(false);
  const [overallProgress, setOverallProgress] = useState(0);
  const [componentProgress, setComponentProgress] = useState(0);
  const [activeComponent, setActiveComponent] = useState("");
  const [burnSummary, setBurnSummary] = useState<BurnSummary | null>(null);

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
        log(t("device.usingPrevious"));
      }
      const transport = new WebUsbTransport(usbDevice);
      const aicDevice = new AicDevice(transport, (message) => {
        if (verboseLogRef.current) {
          log(message);
        }
      });
      await aicDevice.open();
      aicDeviceRef.current = aicDevice;
      setDevice((current) => ({
        ...current,
        connected: true,
        label: transport.label,
        infoText: current.infoText
      }));
      log(t("device.connectedTo", { label: transport.label }));
    });
  }, [log, withBusy, t]);

  const readInfo = useCallback(() => {
    void withBusy(async () => {
      const aicDevice = aicDeviceRef.current;
      if (!aicDevice) {
        throw new Error(t("device.noDevice"));
      }
      log(t("device.readingInfo"));
      const infoText = await aicDevice.deviceInfoText();
      setDevice((current) => ({ ...current, infoText }));
      log(t("device.readSuccess"));
    });
  }, [log, withBusy, t]);

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
      log(t("device.disconnectedLog"));
    });
  }, [log, withBusy, t]);

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
      setBurnSummary(null);
      log(t("burn.starting"));

      const startedAt = Date.now();
      let completedComponents = 0;
      for await (const event of burnImage(aicDevice, parsed, {
        selectedParts: image.selectedParts,
        resetAfterBurn,
        burnTimeoutMs: 60_000
      })) {
        if (event.type === "component-finished") {
          completedComponents += 1;
        }
        applyBurnEvent(event);
      }
      setBurnSummary({
        imageName: parsed.fileName ?? t("image.selectedImage"),
        componentCount: completedComponents,
        selectedParts: selected,
        resetAfterBurn,
        durationMs: Date.now() - startedAt
      });
    });
  }, [applyBurnEvent, image.parsed, image.selectedParts, log, resetAfterBurn, t, withBusy]);

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
          setBurnSummary(null);
          log(t("image.parsed", { name: file.name, count: parsed.metas.length, size: parsed.totalSize.toLocaleString() }));
        } catch (error) {
          log(error instanceof Error ? error.message : String(error), "error");
        }
      })();
    },
    [log, t]
  );

  const togglePart = useCallback((part: string) => {
    setImage((current) => ({
      ...current,
      selectedParts: current.selectedParts.includes(part)
        ? current.selectedParts.filter((item) => item !== part)
        : [...current.selectedParts, part]
    }));
    setBurnSummary(null);
  }, []);

  const burnDisabledReason = getBurnDisabledReason({
    supported: device.supported,
    busy: device.busy,
    connected: device.connected,
    imageReady: Boolean(image.parsed),
    t
  });
  const flowSteps = buildFlowSteps({
    connected: device.connected,
    infoReady: Boolean(device.infoText),
    imageReady: Boolean(image.parsed),
    burnDone: Boolean(burnSummary),
    t
  });

  return (
    <main className="appShell">
      <header className="appHeader">
        <div>
          <h1>{t("header.title")}</h1>
          <p>{t("header.subtitle")}</p>
        </div>
        <div className="headerRight">
          <div className="versionBadge">{t("header.version")}</div>
          <LanguageSwitcher />
        </div>
      </header>

      <FlowStatus steps={flowSteps} />

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
            disabledReason={burnDisabledReason}
            resetAfterBurn={resetAfterBurn}
            verboseLog={verboseLog}
            overallProgress={overallProgress}
            componentProgress={componentProgress}
            activeComponent={activeComponent}
            summary={burnSummary}
            onResetAfterBurnChange={setResetAfterBurn}
            onVerboseLogChange={(value) => {
              verboseLogRef.current = value;
              setVerboseLog(value);
            }}
            onBurn={startBurn}
          />
          <LogPanel logs={logs} onClear={() => setLogs([])} />
        </aside>
      </div>
    </main>
  );
}

function getBurnDisabledReason({
  supported,
  busy,
  connected,
  imageReady,
  t
}: {
  supported: boolean;
  busy: boolean;
  connected: boolean;
  imageReady: boolean;
  t: (key: string) => string;
}): string {
  if (!supported) {
    return t("burn.disabledUnsupported");
  }
  if (busy) {
    return t("burn.disabledBusy");
  }
  if (!connected) {
    return t("burn.disabledDevice");
  }
  if (!imageReady) {
    return t("burn.disabledImage");
  }
  return "";
}

function buildFlowSteps({
  connected,
  infoReady,
  imageReady,
  burnDone,
  t
}: {
  connected: boolean;
  infoReady: boolean;
  imageReady: boolean;
  burnDone: boolean;
  t: (key: string) => string;
}): FlowStep[] {
  const activeKey = !connected
    ? "connect"
    : !infoReady
      ? "readInfo"
      : !imageReady
        ? "selectImage"
        : !burnDone
          ? "burn"
          : "";

  return [
    {
      key: "connect",
      label: t("flow.connect"),
      state: connected ? "done" : activeKey === "connect" ? "active" : "pending"
    },
    {
      key: "readInfo",
      label: t("flow.readInfo"),
      state: infoReady ? "done" : activeKey === "readInfo" ? "active" : "pending"
    },
    {
      key: "selectImage",
      label: t("flow.selectImage"),
      state: imageReady ? "done" : activeKey === "selectImage" ? "active" : "pending"
    },
    {
      key: "burn",
      label: t("flow.burn"),
      state: burnDone ? "done" : activeKey === "burn" ? "active" : "pending"
    }
  ];
}
