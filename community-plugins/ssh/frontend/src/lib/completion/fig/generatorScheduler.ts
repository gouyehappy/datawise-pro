// Wave 1 stub：CompletionController 可选 generators 通道的槽位类型。
// 本轮不接 sidecar completion/execute。

import type { CompletionItem } from "../core/types";

export interface FigGeneratorSlot {
  command: string;
  commandPath: string[];
  tokenStart: number;
  tokenEnd: number;
  /** Opaque payload for a future host executor. */
  payload?: unknown;
}

export type FigGeneratorRun = (slot: FigGeneratorSlot) => Promise<CompletionItem[] | null>;
