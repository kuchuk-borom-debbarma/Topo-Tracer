import { IngestNodeStart, IngestNodeEnd } from "./types";

export class Span {
  private data: Record<string, string> = {};
  private endMessage?: string;
  private ended = false;

  constructor(
    private readonly nodeStart: IngestNodeStart,
    private readonly onEnd: (span: Span) => void
  ) {
    this.data = { ...nodeStart.data };
  }

  setData(key: string, value: string): this {
    if (this.ended) return this;
    this.data[key] = value;
    return this;
  }

  setAttribute(key: string, value: any): this {
    if (this.ended) return this;
    this.data[key] = String(value);
    return this;
  }

  setAllData(data: Record<string, string>): this {
    if (this.ended) return this;
    this.data = { ...this.data, ...data };
    return this;
  }

  end(message?: string): void {
    if (this.ended) return;
    this.ended = true;
    this.endMessage = message;
    this.onEnd(this);
  }

  get id(): string {
    return this.nodeStart.id;
  }

  get traceId(): string {
    return this.nodeStart.traceId;
  }

  get importanceLevel(): number {
    return this.nodeStart.importanceLevel;
  }

  get nodeType(): string {
    return this.nodeStart.nodeType;
  }

  toNodeStart(): IngestNodeStart {
    return {
      ...this.nodeStart,
      data: this.data,
    };
  }

  toNodeEnd(): IngestNodeEnd {
    return {
      id: this.nodeStart.id,
      traceId: this.nodeStart.traceId,
      endedAt: Date.now(),
      endMessage: this.endMessage,
    };
  }
}
