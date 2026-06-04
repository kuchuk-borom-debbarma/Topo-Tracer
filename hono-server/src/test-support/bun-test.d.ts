declare module "bun:test" {
  type TestCallback = () => void | Promise<void>;

  type RejectMatchers = {
    toThrow(expected?: string | RegExp): Promise<void>;
  };

  type ValueMatchers = {
    toBe(expected: unknown): void;
    toHaveLength(expected: number): void;
    toMatchObject(expected: unknown): void;
  };

  type FunctionMatchers = ValueMatchers & {
    toThrow(expected?: string | RegExp): void;
  };

  type PromiseMatchers = ValueMatchers & {
    rejects: RejectMatchers;
  };

  export const describe: (name: string, callback: TestCallback) => void;
  export function expect<T>(actual: Promise<T>): PromiseMatchers;
  export function expect(actual: () => unknown): FunctionMatchers;
  export function expect(actual: unknown): ValueMatchers;
  export const test: (name: string, callback: TestCallback) => void;
}
