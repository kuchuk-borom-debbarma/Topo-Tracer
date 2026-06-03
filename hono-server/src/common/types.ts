import { HTTPResponseError } from "hono/types";

export class TopoTraceException extends Error {
  readonly statusCode: number;
  constructor(msg: string, statusCode: number) {
    super(msg);
    this.statusCode = statusCode;
  }
}
