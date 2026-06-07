import { Logger } from "tslog";
import { ILogReadRepo } from "./ILogReadRepo";
import { ILogWriteRepo } from "./ILogWriteRepo";
import { LogWriteRepoClickHouse } from "./impl/LogWriteRepoClickHouse";
import { LogReadRepoClickHouse } from "./impl/LogReadRepoClickHouse";

/**
 * Factory to construct the concrete telemetry writing repository.
 * Following code-base.md guidelines:
 * - Instantiates LogWriteRepoClickHouse passing the logger for trace context.
 * - Restricts database-specific coupling inside the implementation module.
 */
export const createLogWriteRepo = (
  parentLogger: Logger<unknown>,
): ILogWriteRepo => {
  return new LogWriteRepoClickHouse(parentLogger);
};

/**
 * Factory to construct the concrete telemetry reading repository.
 * Following code-base.md guidelines:
 * - Instantiates LogReadRepoClickHouse passing the logger for trace context.
 * - Restricts database-specific coupling inside the implementation module.
 */
export const createLogReadRepo = (
  parentLogger: Logger<unknown>,
): ILogReadRepo => {
  return new LogReadRepoClickHouse(parentLogger);
};

