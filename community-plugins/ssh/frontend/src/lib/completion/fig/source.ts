// FIG 补全引擎冻结接缝（Wave 1）：controller 只依赖此接口。

import type { CompletionResponse } from "../core/types";

export type FigSpecRaw = unknown;
export type FigSpecManifest = Readonly<Record<string, FigSpecRaw>>;

export interface FigSourceRequest {
  line: string;
  requestId: number;
  revision: number;
  sessionId: string;
  trigger: "typing" | "tab" | "manual";
}

/**
 * 无 spec 命中或仅动态位 → null（调用方 pass-through）。
 * 实现必须吞异常，绝不向上抛。
 */
export interface FigCompletionSource {
  readonly id: string;
  resolve(request: FigSourceRequest): CompletionResponse | null;
}
