/**
 * Public representation of a User.
 * Sensitive database-specific fields are omitted.
 */
export type User = {
  id: string;
  username: string;
  email: string;
  authVersion: number;
  createdAt: Date;
  updatedAt: Date;
};

export type ApiKey = {
  id: string;
  name: string;
  keyPrefix: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
};

export type CreatedApiKey = ApiKey & {
  key: string;
};
