import { rootLogger } from "../../common/logger";
import { eventBus } from "../../infra/event-bus";
import { ILogService } from "./api/ILogService";
import { LogServiceImpl } from "./internal/service-impl/LogServiceImpl";
import { createLogReadRepo, createLogWriteRepo } from "./internal/repo";
import { TraceReadModelMaterializer } from "./internal/materialization/TraceReadModelMaterializer";
import { ReadOptimisedAggregator } from "./internal/worker/ReadOptimisedAggregator";
import { LogIngestConsumer } from "./internal/worker/LogIngestConsumer";

// Instantiate repositories
const readRepo = createLogReadRepo(rootLogger);
const writeRepo = createLogWriteRepo(rootLogger);

// Instantiate trace read model materializer
const materializer = new TraceReadModelMaterializer(rootLogger, readRepo);

/**
 * Public wiring and export point for the Log Service module.
 * Following code-base.md guidelines:
 * - Instantiates LogServiceImpl and passes required singletons (rootLogger, eventBus).
 * - Exports the service under the ILogService interface contract.
 * - Wire aggregator and ingest consumers for reactive background pipeline tasks.
 */
export const logService: ILogService = new LogServiceImpl(rootLogger, eventBus, writeRepo, readRepo);
export const readOptimisedAggregator = new ReadOptimisedAggregator(eventBus, materializer);
export const logIngestConsumer = new LogIngestConsumer(rootLogger, eventBus, writeRepo);
