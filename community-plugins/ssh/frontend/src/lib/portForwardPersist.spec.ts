import { describe, expect, it } from "vitest";
import { removePersistedForward, sanitizePersistedForwards, upsertPersistedForward } from "./portForwardPersist";

describe("port forward persistence", () => {
  it("drops incomplete rows and dedupes", () => {
    expect(
      sanitizePersistedForwards([
        { kind: "local", listenHost: "127.0.0.1", listenPort: "8080", targetHost: "db", targetPort: "5432" },
        { kind: "local", listenHost: "127.0.0.1", listenPort: "8080", targetHost: "db", targetPort: "5432" },
        { kind: "local", listenPort: "" },
      ]),
    ).toHaveLength(1);
  });

  it("upserts and removes by listen endpoint", () => {
    let list = upsertPersistedForward([], {
      kind: "local",
      listenHost: "127.0.0.1",
      listenPort: "80",
      targetHost: "h",
      targetPort: "80",
    });
    list = upsertPersistedForward(list, {
      kind: "dynamic",
      listenHost: "127.0.0.1",
      listenPort: "1080",
      targetHost: "",
      targetPort: "",
    });
    expect(list).toHaveLength(2);
    list = removePersistedForward(list, {
      kind: "local",
      listenHost: "127.0.0.1",
      listenPort: 80,
      targetHost: "h",
      targetPort: 80,
    });
    expect(list.map((row) => row.listenPort)).toEqual(["1080"]);
  });
});
