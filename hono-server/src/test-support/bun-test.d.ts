declare module "bun:test" {
  type TestCallback = () => void | Promise<void>;

  type RejectMatchers = {
    toThrow(expected?: string | RegExp): Promise<void>;
  };

  type Matchers = {
    rejects: RejectMatchers;
    toBe(expected: unknown): void;
    toHaveLength(expected: number): void;
    toMatchObject(expected: unknown): void;
    toThrow(expected?: string | RegExp): void;
  };

  export const describe: (name: string, callback: TestCallback) => void;
  export const expect: (actual: unknown) => Matchers;
  export const test: (name: string, callback: TestCallback) => void;
}
