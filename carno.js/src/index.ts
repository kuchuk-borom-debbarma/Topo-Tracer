import { Carno, Controller, Get } from "@carno.js/core";
import { LogRepo } from "./services/log/internal/LogRepo";
import { LogRepoClickHouseImpl } from "./services/log/internal/repo-impls/LogRepoClickHouseImpl";
import { LogService } from "./services/log/LogService";
import { LogServiceImpl } from "./services/log/internal/LogServiceImpl";
import { ClickHouseService } from "./infra/ClickHouseService";
import { LogController } from "./routes/LogController";
import { MessageBroker } from "./infra/message/MessageBroker";
import { InMemoryMessageBroker } from "./infra/message/InMemoryMessageBroker";
import { TraceNodeResolver } from "./services/log/internal/listeners/operators/TraceNodeResolver";
import { TraceEdgeResolver } from "./services/log/internal/listeners/operators/TraceEdgeResolver";
import { TraceClosureBuilder } from "./services/log/internal/listeners/operators/TraceClosureBuilder";
import { TraceMaterializationListener } from "./services/log/internal/listeners/TraceMaterializationListener";

@Controller()
class AppController {
  constructor(private logService: LogService) {}

  @Get()
  hello() {
    return "Hello World";
  }

  @Get("/test")
  async test() {
    await this.logService.logContainer({
      id: "con_test_123",
      name: "web-portal-pod",
      containerType: "pod",
      createdAtLocal: new Date(),
    });
    return { ok: true, message: "Logged successfully to ClickHouse!" };
  }
}

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
  { token: MessageBroker, useClass: InMemoryMessageBroker },
  TraceNodeResolver,
  TraceEdgeResolver,
  TraceClosureBuilder,
  TraceMaterializationListener,
]);

app.controllers([AppController, LogController]);
app.listen(3000);
