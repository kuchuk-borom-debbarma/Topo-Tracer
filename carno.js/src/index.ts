import { Carno, Controller, Get } from "@carno.js/core";
import { LogRepo } from "./services/log/internal/LogRepo";
import { LogRepoClickHouseImpl } from "./services/log/internal/repo-impls/LogRepoClickHouseImpl";
import { LogService } from "./services/log/LogService";
import { LogServiceImpl } from "./services/log/internal/LogServiceImpl";

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
      createdAtRemote: new Date(),
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
  { token: LogRepo, useClass: LogRepoClickHouseImpl },
  { token: LogService, useClass: LogServiceImpl },
]);

app.controllers([AppController]);
app.listen(3000);
