import { IAuthRepo } from "./IAuthRepo";
import { AuthRepoPg } from "./impl/AuthRepoPg";

export const authRepo: IAuthRepo = new AuthRepoPg();
