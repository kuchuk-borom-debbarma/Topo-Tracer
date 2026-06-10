declare module "bun:test" {
  type TestCallback = () => void | Promise<void>;

  type RejectMatchers = {
    toThrow(expected?: string | RegExp): Promise<void>;
  };

  type Mock<T extends (...args: any[]) => any> = T & {
    mock: {
      calls: Parameters<T>[][];
      results: { type: "return" | "throw"; value: ReturnType<T> | any }[];
      implementation: T;
      mockImplementation(fn: T): Mock<T>;
      mockImplementationOnce(fn: T): Mock<T>;
      mockResolvedValue(value: Awaited<ReturnType<T>>): Mock<T>;
      mockResolvedValueOnce(value: Awaited<ReturnType<T>>): Mock<T>;
    };
  };

  type ValueMatchers = {
    toBe(expected: unknown): void;
    toEqual(expected: unknown): void;
    toHaveLength(expected: number): void;
    toMatchObject(expected: unknown): void;
    toBeDefined(): void;
    toBeUndefined(): void;
    toContain(expected: unknown): void;
    toContainEqual(expected: unknown): void;
    toMatch(expected: string | RegExp): void;
    toBeNull(): void;
    toBeGreaterThan(expected: number): void;
    toBeLessThan(expected: number): void;
    toBeTypeOf(expected: string): void;
    toHaveProperty(path: string | string[], value?: any): void;
    toHaveBeenCalled(): void;
    toHaveBeenCalledTimes(count: number): void;
    toHaveBeenCalledWith(...args: any[]): void;
    not: ValueMatchers;
  };

  type FunctionMatchers = ValueMatchers & {
    toThrow(expected?: string | RegExp): void;
  };

  type PromiseMatchers = ValueMatchers & {
    rejects: RejectMatchers;
  };

  export const describe: (name: string, callback: () => void) => void;
  export function expect<T>(actual: Promise<T>): PromiseMatchers;
  export function expect(actual: () => unknown): FunctionMatchers;
  export function expect(actual: unknown): ValueMatchers;
  export namespace expect {
    function objectContaining(expected: unknown): unknown;
  }
  export const test: (name: string, callback: TestCallback) => void;
  export const it: (name: string, callback: TestCallback) => void;
  export function mock<T extends (...args: any[]) => any>(implementation?: T): Mock<T>;
  export function spyOn<T extends object, K extends keyof T>(
    obj: T,
    method: K
  ): Mock<T[K] extends (...args: any[]) => any ? T[K] : never>;
}

declare const process: {
  cwd(): string;
  memoryUsage(): { heapUsed: number };
};
