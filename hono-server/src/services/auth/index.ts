import { rootLogger } from "../../common/logger";
import { IAuthService } from "./api/IAuthService";
import { AuthServiceImpl } from "./internal/service-impl/AuthServiceImpl";

/**
 * Public wiring and export point for the Auth Service module.
 * Following code-base.md guidelines:
 * - Instantiates the service implementation passing required dependencies (rootLogger).
 * - Exports the constructed service using the interface contract type IAuthService.
 * - Outer modules must import from here, never from the internal/ folder directly.
 */
export const authService: IAuthService = new AuthServiceImpl(rootLogger);

