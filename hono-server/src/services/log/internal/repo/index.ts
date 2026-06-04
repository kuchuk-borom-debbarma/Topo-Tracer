import { Logger } from "tslog";
import { ILogReadRepo } from "./ILogReadRepo";
import { ILogWriteRepo } from "./ILogWriteRepo";
import { LogWriteRepoClickHouse } from "./impl/LogWriteRepoClickHouse";
import { LogReadRepoClickHouse } from "./impl/LogReadRepoClickHouse";

export const createLogWriteRepo = (
  parentLogger: Logger<unknown>,
): ILogWriteRepo => {
  return new LogWriteRepoClickHouse(parentLogger);
};

export const createLogReadRepo = (
  parentLogger: Logger<unknown>,
): ILogReadRepo => {
  return new LogReadRepoClickHouse(parentLogger);
};
