import { ILogReadRepo } from "./ILogReadRepo";
import { ILogWriteRepo } from "./ILogWriteRepo";

class DevLogWriteRepo extends ILogWriteRepo {}
class DevLogReadRepo extends ILogReadRepo {}

export const logWriteRepo: ILogWriteRepo = new DevLogWriteRepo();
export const logReadRepo: ILogReadRepo = new DevLogReadRepo();
