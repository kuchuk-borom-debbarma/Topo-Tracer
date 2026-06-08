import { describe, expect, test } from "bun:test";
import { encodeCursor, decodeCursor } from "./CursorCodec";

describe("CursorCodec", () => {
  test("encodes offset and materializedAt into a base64 string", () => {
    const offset = 123;
    const materializedAt = 1623150000000;
    const cursor = encodeCursor(offset, materializedAt);
    
    expect(typeof cursor).toBe("string");
    expect(cursor).not.toBe(`${offset}:${materializedAt}`);
    
    // Check if it's valid base64
    const decodedRaw = Buffer.from(cursor, "base64").toString("utf-8");
    expect(decodedRaw).toBe("123:1623150000000");
  });

  test("decodes a valid cursor string back into offset and materializedAt", () => {
    const cursor = Buffer.from("456:1623160000000").toString("base64");
    const result = decodeCursor(cursor);
    
    expect(result).toEqual({
      offset: 456,
      materializedAt: 1623160000000
    });
  });

  test("throws an error for malformed cursor strings", () => {
    const invalidCursors = [
      "not-base64-at-all!@#",
      Buffer.from("invalid-format").toString("base64"),
      Buffer.from("abc:def").toString("base64"),
      Buffer.from(":123").toString("base64"),
      Buffer.from("123:").toString("base64"),
    ];

    for (const cursor of invalidCursors) {
      expect(() => decodeCursor(cursor)).toThrow("Malformed cursor");
    }
  });

  test("round-trip consistency", () => {
    const offset = 789;
    const materializedAt = Date.now();
    const cursor = encodeCursor(offset, materializedAt);
    const decoded = decodeCursor(cursor);
    
    expect(decoded.offset).toBe(offset);
    expect(decoded.materializedAt).toBe(materializedAt);
  });
});
