import { Carno } from "@carno.js/core";
import { LogService } from "./services/log/LogService";
import { ClickHouseService } from "./infra/ClickHouseService";
import { LogController } from "./routes/LogController";
import { TraceMaterializationWorker } from "./services/log/worker/TraceMaterializationWorker";

const app = new Carno({
  validation: true,
  cors: {
    origins: "*",
  },
});

app.services([
  ClickHouseService,
  LogService,
  TraceMaterializationWorker,
]);

app.controllers([LogController]);
app.listen(3000);
