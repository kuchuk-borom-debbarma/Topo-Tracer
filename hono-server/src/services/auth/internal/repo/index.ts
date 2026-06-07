import { IAuthRepo } from "./IAuthRepo";
import { AuthRepoPg } from "./impl/AuthRepoPg";

/**
 * Internal repository wiring and export point.
 * Following code-base.md guidelines:
 * - Instantiates the concrete repository implementation (AuthRepoPg).
 * - Exports using the abstract contract type IAuthRepo.
 * - Restricts repository access to the auth service implementation itself.
 */
export const authRepo: IAuthRepo = new AuthRepoPg();

