import { describe, expect, it } from "vitest";
import {
  interactivePromptNearCursor,
  isAuthChallengeLine,
  isInteractivePromptLine,
  isInteractivePromptPending,
  isSelectionPromptLine,
} from "./interactivePromptGuard";

describe("isAuthChallengeLine", () => {
  it("matches waiting-for-code prompt lines", () => {
    for (const line of [
      "[OTP Code]:",
      "OTP:",
      "MFA code:",
      "Please enter MFA code:",
      "One-Time Password:",
      "验证码:",
      "请输入验证码:",
      "动态口令:",
    ]) {
      expect(isAuthChallengeLine(line), line).toBe(true);
    }
  });

  it("matches imperative instruction lines without a trailing colon", () => {
    for (const line of ["Please Enter MFA Code.", "Enter the verification code", "enter OTP"]) {
      expect(isAuthChallengeLine(line), line).toBe(true);
    }
  });

  it("leaves ordinary shell prompts and logs alone", () => {
    for (const line of [
      "root@bastion:~$",
      "docker ps",
      "config: otp_timeout = 30s",
      "MFA is enabled for this account",
      "",
    ]) {
      expect(isAuthChallengeLine(line), line).toBe(false);
    }
  });
});

describe("isSelectionPromptLine", () => {
  it("matches select/choose prompts", () => {
    for (const line of [
      "Select server:",
      "Please select a target host:",
      "Choose an option:",
      "请选择要连接的服务器:",
      "请输入服务器编号:",
      "输入序号:",
    ]) {
      expect(isSelectionPromptLine(line), line).toBe(true);
    }
  });

  it("keeps matching after an answer or caret echo lands after the colon", () => {
    for (const line of [
      "请输入命令编号：^[[A",
      "请输入命令编号：5",
      "Select server:12",
    ]) {
      expect(isSelectionPromptLine(line), line).toBe(true);
    }
  });

  it("matches y/n confirm brackets", () => {
    for (const line of ["Continue? (y/n)", "Proceed (yes/no):", "Overwrite? [Y/n]"]) {
      expect(isSelectionPromptLine(line), line).toBe(true);
    }
  });
});

describe("isInteractivePromptLine", () => {
  it("combines dynamic-code, password and selection heuristics", () => {
    expect(isInteractivePromptLine("[OTP Code]:")).toBe(true);
    expect(isInteractivePromptLine("Password:")).toBe(true);
    expect(isInteractivePromptLine("[sudo] password for ops:")).toBe(true);
    expect(isInteractivePromptLine("Select server:")).toBe(true);
  });

  it("strips a trailing caret-echo tail before judging", () => {
    expect(isInteractivePromptLine("请输入命令编号：^[[A")).toBe(true);
    expect(isInteractivePromptLine("Password: ^[[A")).toBe(true);
  });

  it("stays quiet on an ordinary prompt line", () => {
    expect(isInteractivePromptLine("root@bastion:~$")).toBe(false);
    expect(isInteractivePromptLine("")).toBe(false);
  });
});

describe("interactivePromptNearCursor", () => {
  it("samples the cursor row and the one above it", () => {
    const lines = ["", "Please Enter MFA Code.", "[OTP Code]: "];
    const at = (row: number) => lines[row] ?? "";
    expect(interactivePromptNearCursor(2, at)).toBe(true);
    expect(interactivePromptNearCursor(1, at)).toBe(true);
    expect(interactivePromptNearCursor(0, at)).toBe(false);
  });
});

describe("isInteractivePromptPending", () => {
  it("pends when either the on-screen prompt line or the challenge dialog is live", () => {
    expect(isInteractivePromptPending({ promptLineOnScreen: false, challengeDialogPending: false })).toBe(false);
    expect(isInteractivePromptPending({ promptLineOnScreen: true, challengeDialogPending: false })).toBe(true);
    expect(isInteractivePromptPending({ promptLineOnScreen: false, challengeDialogPending: true })).toBe(true);
  });
});
