/**
 * Public representation of a User.
 * Following code-base.md guidelines:
 * - Public types are kept in api/types.ts.
 * - Sensitive database-specific fields (e.g., password hashes) are omitted
 *   to ensure database-only details do not leak through the service boundary.
 */
export type User = {
  id: string;
  username: string;
  email: string;
  createdAt: Date;
  updatedAt: Date;
};

