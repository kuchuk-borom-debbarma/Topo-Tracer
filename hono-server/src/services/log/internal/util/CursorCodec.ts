/**
 * Utility for encoding and decoding opaque paging cursors.
 * Cursors are Base64 encoded strings of format "offset:materializedAt".
 */

/**
 * Encodes an offset and materialization timestamp into an opaque Base64 cursor.
 */
export function encodeCursor(offset: number, materializedAt: number): string {
  return Buffer.from(`${offset}:${materializedAt}`).toString("base64");
}

/**
 * Decodes an opaque Base64 cursor into its constituent offset and materialization timestamp.
 * Throws an error if the cursor is malformed.
 */
export function decodeCursor(cursor: string): { offset: number; materializedAt: number } {
  try {
    const decoded = Buffer.from(cursor, "base64").toString("utf-8");
    const parts = decoded.split(":");
    
    if (parts.length !== 2) {
      throw new Error("Invalid format");
    }

    const [offsetStr, materializedAtStr] = parts;
    const offset = parseInt(offsetStr, 10);
    const materializedAt = parseInt(materializedAtStr, 10);

    if (isNaN(offset) || isNaN(materializedAt) || offsetStr === "" || materializedAtStr === "") {
      throw new Error("Invalid values");
    }

    return { offset, materializedAt };
  } catch (err) {
    throw new Error("Malformed cursor");
  }
}
