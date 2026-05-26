import { Carno, Controller, Get } from "@carno.js/core";

@Controller()
class AppController {
  @Get()
  hello() {
    return "Hello World";
  }
}

const app = new Carno({
  validation: true,
  cors: {
    origins: "*",
  },
});

app.controllers([AppController]);
app.listen(3000);
