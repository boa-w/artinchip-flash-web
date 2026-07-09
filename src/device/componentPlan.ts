import type { FwcMeta } from "../image/types";

export type ComponentKind = "updater" | "image-info" | "target" | "other";

export interface FirmwareComponent {
  meta: FwcMeta;
  kind: ComponentKind;
  selected: boolean;
}

export function classifyComponents(
  metas: FwcMeta[],
  selectedParts: string[]
): FirmwareComponent[] {
  return metas.map((meta) => {
    const kind = classifyMeta(meta);
    return {
      meta,
      kind,
      selected: kind !== "target" || targetPartSelected(meta, selectedParts)
    };
  });
}

function classifyMeta(meta: FwcMeta): ComponentKind {
  if (meta.name.startsWith("image.updater.")) {
    return "updater";
  }
  if (meta.name === "image.info") {
    return "image-info";
  }
  if (meta.name.startsWith("image.target.")) {
    return "target";
  }
  return "other";
}

function targetPartSelected(meta: FwcMeta, selectedParts: string[]): boolean {
  const targetName = meta.name.replace(/^image\.target\./, "");
  return selectedParts.some(
    (part) => part === meta.partition || part === targetName || part === meta.name
  );
}
