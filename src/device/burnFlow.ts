import type { ParsedImage } from "../image/types";
import type { AicDevice } from "./AicDevice";
import { classifyComponents } from "./componentPlan";
import type { BurnEvent, BurnOptions } from "./events";

export async function* burnImage(
  _device: AicDevice,
  image: ParsedImage,
  options: BurnOptions
): AsyncIterable<BurnEvent> {
  const plan = classifyComponents(image.metas, options.selectedParts);
  yield {
    type: "stage",
    message: `Built component plan with ${plan.length} component(s). Full burn is gated until hardware validation passes.`
  };
  throw new Error("Full burn flow is not enabled yet. Validate GET_HWINFO on hardware first.");
}
