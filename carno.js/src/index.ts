import { Carno } from "@carno.js/core";
import { LogRepo } from "./services/log/internal/LogRepo";
import { LogRepoClickHouseImpl } from "./services/log/internal/repo-impls/LogRepoClickHouseImpl";
import { LogService } from "./services/log/LogService";
import { LogServiceImpl } from "./services/log/internal/LogServiceImpl";
import { ClickHouseService } from "./infra/ClickHouseService";
import { LogController } from "./routes/LogController";

const app = new Carno({
  validation: true,
  cors: {
    origins: "*",
  },
});

app.services([
  ClickHouseService,
  { token: LogRepo, useClass: LogRepoClickHouseImpl },
  { token: LogService, useClass: LogServiceImpl },
]);

app.controllers([LogController]);
app.listen(3000);
