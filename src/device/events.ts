export type BurnEvent =
  | { type: "log"; message: string }
  | { type: "stage"; message: string }
  | { type: "component-started"; name: string; partition: string; size: number }
  | { type: "component-progress"; name: string; sent: number; total: number }
  | { type: "overall-progress"; sent: number; total: number }
  | { type: "component-finished"; name: string }
  | { type: "finished" };

export interface BurnOptions {
  selectedParts: string[];
  resetAfterBurn: boolean;
}
