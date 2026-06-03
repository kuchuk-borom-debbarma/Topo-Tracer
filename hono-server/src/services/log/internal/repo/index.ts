import { Logger } from "tslog";
import { ILogReadRepo } from "./ILogReadRepo";
import { ILogWriteRepo } from "./ILogWriteRepo";
import { LogWriteRepoClickHouse } from "./impl/LogWriteRepoClickHouse";

class DevLogReadRepo extends ILogReadRepo {}

export const createLogWriteRepo = (
  parentLogger: Logger<unknown>,
): ILogWriteRepo => {
  return new LogWriteRepoClickHouse(parentLogger);
};

export const logReadRepo: ILogReadRepo = new DevLogReadRepo();
