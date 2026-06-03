import { Logger } from "tslog";
import { ILogService } from "../../api/ILogService";
import {
  IngestEdgeStart,
  IngestNodeStart,
  IngestNodeEnd,
  IngestEdgeEnd,
} from "../../api/types";
import { createLogWriteRepo } from "../repo";
import { ILogWriteRepo } from "../repo/ILogWriteRepo";

export class LogServiceImpl extends ILogService {
  readonly logger: Logger<unknown>;
  readonly writeRepo: ILogWriteRepo;
  constructor(logger: Logger<unknown>, writeRepo?: ILogWriteRepo) {
    super();
    this.logger = logger.getSubLogger({ name: "LogServiceImpl" });
    this.writeRepo = writeRepo ?? createLogWriteRepo(this.logger);
  }
  async ingestNodesNEdges(data: {
    userId: string;
    nodeStarts: IngestNodeStart[];
    edgeStarts: IngestEdgeStart[];
    nodeEnds: IngestNodeEnd[];
    edgeEnds: IngestEdgeEnd[];
  }): Promise<void> {
    this.logger.trace("ingestNodesNEdges", {
      userId: data.userId,
      nodeStarts: data.nodeStarts.length,
      edgeStarts: data.edgeStarts.length,
      nodeEnds: data.nodeEnds.length,
      edgeEnds: data.edgeEnds.length,
    });

    try {
      // Service owns orchestration; persistence stays behind the repo contract.
      await this.writeRepo.ingestNodesNEdges(data);
    } catch (err) {
      this.logger.error(err);
      throw err;
    }
  }
}
