import type { ParsedImage } from "../image/types";
import type { AicDevice } from "./AicDevice";
import { classifyComponents } from "./componentPlan";
import type { BurnEvent, BurnOptions } from "./events";

export async function* burnImage(
  device: AicDevice,
  image: ParsedImage,
  options: BurnOptions
): AsyncIterable<BurnEvent> {
  const plan = classifyComponents(image.metas, options.selectedParts);
  yield { type: "stage", message: `Built component plan with ${plan.length} component(s)` };

  const burnPlan = plan.filter(
    (component) =>
      component.kind === "updater" ||
      component.kind === "image-info" ||
      (component.kind === "target" && component.selected)
  );
  const overallTotal = burnPlan.reduce((sum, component) => sum + component.meta.size, 0);
  let overallSent = 0;

  const updaterComponents = plan.filter((component) => component.kind === "updater");
  if (updaterComponents.length > 0) {
    yield { type: "stage", message: "Send updater components" };
    for (let index = 0; index < updaterComponents.length; index += 1) {
      const component = updaterComponents[index];
      const allowFinalNoCsw = index === updaterComponents.length - 1;
      for await (const event of device.sendComponent(
        image,
        component,
        allowFinalNoCsw,
        overallSent,
        overallTotal
      )) {
        if (event.type === "overall-progress") {
          overallSent = event.sent;
        }
        yield event;
      }

      if (index < updaterComponents.length - 1) {
        yield { type: "stage", message: "Probe bootloader between updater components" };
        await device.sleep(30);
        await device.getHwInfo();
      }
    }

    yield { type: "stage", message: "Wait for bootloader reconnect" };
    try {
      await device.waitReconnect(options.burnTimeoutMs);
    } catch (error) {
      yield {
        type: "log",
        message: `Warning: updater reconnect was not observed: ${
          error instanceof Error ? error.message : String(error)
        }`
      };
    }

    yield { type: "stage", message: "Probe bootloader after reconnect" };
    await device.getHwInfo();
  } else {
    yield {
      type: "log",
      message: "No updater components found; continuing on current connection."
    };
  }

  yield { type: "stage", message: "Set full-disk upgrade mode" };
  await device.setFullDiskUpgradeMode();

  const imageInfo = plan.find((component) => component.kind === "image-info");
  if (imageInfo) {
    for await (const event of device.sendComponent(
      image,
      imageInfo,
      false,
      overallSent,
      overallTotal
    )) {
      if (event.type === "overall-progress") {
        overallSent = event.sent;
      }
      yield event;
    }
  } else {
    yield { type: "log", message: "Warning: no image.info component found" };
  }

  const selectedTargets = plan.filter(
    (component) => component.kind === "target" && component.selected
  );
  if (selectedTargets.length === 0) {
    throw new Error("No selected target components to burn");
  }

  for (const component of selectedTargets) {
    for await (const event of device.sendComponent(
      image,
      component,
      false,
      overallSent,
      overallTotal
    )) {
      if (event.type === "overall-progress") {
        overallSent = event.sent;
      }
      yield event;
    }
  }

  yield { type: "stage", message: "End upgrade" };
  await device.setUpgradeEnd();

  if (options.resetAfterBurn) {
    yield { type: "stage", message: "Reset device" };
    try {
      await device.reset();
    } catch (error) {
      yield {
        type: "log",
        message: `Warning: reset failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  yield { type: "finished" };
}
