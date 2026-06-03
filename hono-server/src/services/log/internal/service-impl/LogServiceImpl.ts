import { Logger } from "tslog";
import { ILogService } from "../../api/ILogService";
import {
  IngestEdgeStart,
  IngestNodeStart,
  IngestNodeEnd,
  IngestEdgeEnd,
} from "../../api/types";
import { ILogWriteRepo } from "../repo/ILogWriteRepo";

export class LogServiceImpl extends ILogService {
  readonly logger: Logger<unknown>;
  readonly writeRepo: ILogWriteRepo;
  constructor(logger: Logger<unknown>, writeRepo: ILogWriteRepo) {
    super();
    this.logger = logger.getSubLogger({ name: "LogServiceImpl" });
    this.writeRepo = writeRepo;
  }
  ingestNodesNEdges(data: {
    nodeStarts: IngestNodeStart[];
    edgeStarts: IngestEdgeStart[];
    nodeEnds: IngestNodeEnd[];
    edgeEnds: IngestEdgeEnd[];
  }): Promise<void> {
    throw new Error("Method not implemented.");
  }
}
