import { Carno } from "@carno.js/core";
import { LogService } from "./services/log/LogService";
import { ClickHouseService } from "./infra/ClickHouseService";
import { LogController } from "./routes/LogController";
import { RawEventRepository } from "./services/log/RawEventRepository";
import { ReadModelRepository } from "./services/log/ReadModelRepository";
import { TraceReadModelBuilder } from "./services/log/TraceReadModelBuilder";
import { TraceReadModelWorker } from "./services/log/worker/TraceReadModelWorker";

const app = new Carno({
  validation: true,
  cors: {
    origins: "*",
  },
});

app.services([
  ClickHouseService,
  RawEventRepository,
  ReadModelRepository,
  TraceReadModelBuilder,
  LogService,
  TraceReadModelWorker,
]);

app.controllers([LogController]);
app.listen(Number(process.env.PORT ?? 3999));
