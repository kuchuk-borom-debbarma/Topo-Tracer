export class TopoTraceException extends Error {
  readonly statusCode: number;
  constructor(msg: string, statusCode: number) {
    super(msg);
    this.statusCode = statusCode;
  }
}

export class ConflictError extends TopoTraceException {
  constructor(msg: string) {
    super(msg, 409);
  }
}
