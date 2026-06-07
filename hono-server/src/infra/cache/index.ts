import { ICache } from "./api/ICache";
import { InMemoryCache } from "./internal/InMemoryCache";

/**
 * Public wiring and export point for the Cache infrastructure module.
 * Following code-base.md guidelines:
 * - Instantiates InMemoryCache.
 * - Exports using the abstract contract type ICache.
 * - Restricts direct implementation imports from other modules.
 */
export const cache: ICache = new InMemoryCache();
