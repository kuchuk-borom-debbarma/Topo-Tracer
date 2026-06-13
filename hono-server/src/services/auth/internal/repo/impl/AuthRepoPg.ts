import type { User } from "../../../api/types";
import { IAuthRepo } from "../IAuthRepo";
import type { ApiKeyRow, PendingUser, TokenOTP } from "../types";
import crypto from "crypto";
import { postgres } from "../../../../../infra/db";
import { TopoTraceException } from "../../../../../common/types";
import { hashPassword } from "../../util/hash";

/**
 * PostgreSQL implementation of the Auth Repository contract.
 * Following code-base.md guidelines:
 * - This class resides in internal/repo/impl.
 * - It inherits from the abstract IAuthRepo contract.
 * - Responsible for mapping PostgreSQL tables/rows to the service module's internal types.
 * - Connects using the initialized postgres singleton client.
 */
export class AuthRepoPg extends IAuthRepo {
  private get sql() {
    return postgres.getInitializedPostgresClient();
  }

  /**
   * Retrieves a user matching the provided filters.
   * Will execute SQL select against the users table.
   */
  async getUserByFilter(filters: {
    email?: string;
    password?: string;
  }): Promise<User> {
    const { email, password } = filters;
    if (!email) {
      throw new Error("Email filter is required.");
    }

    const row = await this.fetchUserRowByEmail(email);
    if (!row) {
      throw new TopoTraceException("User not found or invalid credentials.", 401);
    }

    await this.verifyPasswordMatch(password, row.password_hash);

    return {
      id: row.id,
      username: row.username,
      email: row.email,
      authVersion: row.auth_version,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  private async fetchUserRowByEmail(email: string): Promise<any | null> {
    const rows = await this.sql<any[]>`
      SELECT id, username, email, password_hash, auth_version, created_at, updated_at
      FROM users
      WHERE email = ${email}
    `;
    return rows[0] ?? null;
  }

  private async verifyPasswordMatch(plain: string | undefined, hashed: string): Promise<void> {
    if (!plain) return;
    const computed = await hashPassword(plain);
    if (computed !== hashed) {
      throw new TopoTraceException("User not found or invalid credentials.", 401);
    }
  }

  /**
   * Inserts a fully active user record.
   * Will execute an insert into the users table.
   */
  async insertUser(data: {
    username: string;
    email: string;
    password: string;
    isPasswordHashed?: boolean;
  }): Promise<User> {
    const id = crypto.randomUUID();
    const passwordHash = data.isPasswordHashed ? data.password : await hashPassword(data.password);

    const rows = await this.sql<any[]>`
      INSERT INTO users (id, username, email, password_hash, auth_version, created_at, updated_at)
      VALUES (${id}, ${data.username}, ${data.email}, ${passwordHash}, 1, NOW(), NOW())
      RETURNING id, username, email, auth_version, created_at, updated_at
    `;

    const row = rows[0];
    return {
      id: row.id,
      username: row.username,
      email: row.email,
      authVersion: row.auth_version,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  /**
   * Inserts a temporary pending signup record.
   * Will execute an insert into the pending_users table.
   */
  async insertPendingSignUpUser(
    data: {
      username: string;
      email: string;
      password: string;
      traceId?: string;
      parentSpanId?: string;
    },
    tx?: any,
  ): Promise<PendingUser> {
    const client = tx ?? this.sql;
    const id = crypto.randomUUID();
    const passwordHash = await hashPassword(data.password);

    const rows = await client<any[]>`
      INSERT INTO pending_users (id, username, email, password, trace_id, parent_span_id, created_at)
      VALUES (${id}, ${data.username}, ${data.email}, ${passwordHash}, ${data.traceId ?? null}, ${data.parentSpanId ?? null}, NOW())
      RETURNING id, username, email, password, trace_id as "trace_id", parent_span_id as "parent_span_id"
    `;

    const row = rows[0];
    return {
      id: row.id,
      username: row.username,
      email: row.email,
      hashedPassword: row.password,
      traceId: row.trace_id || undefined,
      parentSpanId: row.parent_span_id || undefined,
    };
  }

  /**
   * Finds a pending signup record by its primary token ID.
   */
  async getPendingUserById(token: string): Promise<PendingUser> {
    const rows = await this.sql<any[]>`
      SELECT id, username, email, password, trace_id as "trace_id", parent_span_id as "parent_span_id"
      FROM pending_users
      WHERE id = ${token}
    `;

    if (rows.length === 0) {
      throw new TopoTraceException("Pending user registration not found.", 404);
    }

    const row = rows[0];
    return {
      id: row.id,
      username: row.username,
      email: row.email,
      hashedPassword: row.password,
      traceId: row.trace_id || undefined,
      parentSpanId: row.parent_span_id || undefined,
    };
  }

  /**
   * Upserts the OTP verification code and token binding.
   * Will execute SQL upsert on token_otps table.
   */
  async upsertUserTokenOTP(
    data: {
      otp: string;
      token: string;
    },
    tx?: any,
  ): Promise<TokenOTP> {
    const client = tx ?? this.sql;
    const rows = await client<any[]>`
      INSERT INTO token_otps (id, token, otp, token_type, created_at)
      VALUES (${data.token}, ${data.token}, ${data.otp}, 'USER_SIGNUP', NOW())
      ON CONFLICT (id) DO UPDATE
      SET otp = EXCLUDED.otp, created_at = NOW()
      RETURNING id, token, otp, token_type as "tokenType"
    `;

    const row = rows[0];
    return {
      id: row.id,
      token: row.token,
      otp: row.otp,
      tokenType: row.tokenType as TokenOTP["tokenType"],
    };
  }

  /**
   * Finds verification code state by token ID.
   */
  async getTokenOTPById(token: string): Promise<TokenOTP> {
    const rows = await this.sql<any[]>`
      SELECT id, token, otp, token_type as "tokenType"
      FROM token_otps
      WHERE id = ${token}
    `;

    if (rows.length === 0) {
      throw new TopoTraceException("Verification token not found.", 404);
    }

    const row = rows[0];
    return {
      id: row.id,
      token: row.token,
      otp: row.otp,
      tokenType: row.tokenType as TokenOTP["tokenType"],
    };
  }

  /**
   * Retrieves a fully registered user by their ID.
   */
  async getUserById(token: string): Promise<User> {
    const rows = await this.sql<any[]>`
      SELECT id, username, email, auth_version, created_at, updated_at
      FROM users
      WHERE id = ${token}
    `;

    if (rows.length === 0) {
      throw new TopoTraceException("User profile not found.", 404);
    }

    const row = rows[0];
    return {
      id: row.id,
      username: row.username,
      email: row.email,
      authVersion: row.auth_version,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  /**
   * Updates a user's password in the database.
   */
  async updateUserPassword(data: {
    userId: string;
    password: string;
  }): Promise<void> {
    const passwordHash = await hashPassword(data.password);
    const result = await this.sql`
      UPDATE users
      SET password_hash = ${passwordHash}, 
          auth_version = auth_version + 1,
          updated_at = NOW()
      WHERE id = ${data.userId}
    `;
    if (result.count === 0) {
      throw new TopoTraceException("User profile not found.", 404);
    }
  }

  /**
   * Inserts a new Token OTP verification record.
   */
  async insertUserTokenOTP(data: {
    otp: string;
    token: string;
    tokenType: TokenOTP["tokenType"];
  }): Promise<TokenOTP> {
    const id = crypto.randomUUID();
    const rows = await this.sql<any[]>`
      INSERT INTO token_otps (id, token, otp, token_type, created_at)
      VALUES (${id}, ${data.token}, ${data.otp}, ${data.tokenType}, NOW())
      RETURNING id, token, otp, token_type as "tokenType"
    `;

    const row = rows[0];
    return {
      id: row.id,
      token: row.token,
      otp: row.otp,
      tokenType: row.tokenType as TokenOTP["tokenType"],
    };
  }

  /**
   * Deletes all Token OTP records matching the given token reference and type.
   */
  async deleteUserTokenOTPs(data: {
    token: string;
    tokenType: TokenOTP["tokenType"];
  }): Promise<void> {
    if (data.tokenType === "USER_SIGNUP") {
      await this.sql`
        DELETE FROM token_otps
        WHERE id = ${data.token} AND token_type = ${data.tokenType}
      `;
    } else {
      await this.sql`
        DELETE FROM token_otps
        WHERE token = ${data.token} AND token_type = ${data.tokenType}
      `;
    }
  }

  async insertApiKey(data: {
    userId: string;
    name: string;
    keyHash: string;
    keyPrefix: string;
    keyVal?: string;
  }): Promise<ApiKeyRow> {
    const id = crypto.randomUUID();
    const rows = await this.sql<any[]>`
      INSERT INTO api_keys (id, user_id, name, key_hash, key_prefix, key_val, created_at)
      VALUES (${id}, ${data.userId}, ${data.name}, ${data.keyHash}, ${data.keyPrefix}, ${data.keyVal ?? null}, NOW())
      RETURNING id, user_id, name, key_hash, key_prefix, key_val, created_at, last_used_at, revoked_at
    `;
    return mapApiKeyRow(rows[0]);
  }

  async listApiKeys(userId: string): Promise<ApiKeyRow[]> {
    const rows = await this.sql<any[]>`
      SELECT id, user_id, name, key_hash, key_prefix, key_val, created_at, last_used_at, revoked_at
      FROM api_keys
      WHERE user_id = ${userId}
      ORDER BY created_at DESC
    `;
    return rows.map(mapApiKeyRow);
  }

  async revokeApiKey(data: { userId: string; apiKeyId: string }): Promise<void> {
    await this.sql`
      UPDATE api_keys
      SET revoked_at = NOW()
      WHERE id = ${data.apiKeyId} AND user_id = ${data.userId} AND revoked_at IS NULL
    `;
  }

  async getUserByApiKeyHash(keyHash: string): Promise<User | null> {
    const rows = await this.sql<any[]>`
      SELECT u.id, u.username, u.email, u.auth_version, u.created_at, u.updated_at, k.id as api_key_id
      FROM api_keys k
      JOIN users u ON u.id = k.user_id
      WHERE k.key_hash = ${keyHash} AND k.revoked_at IS NULL
      LIMIT 1
    `;
    const row = rows[0];
    if (!row) return null;
    await this.markApiKeyUsed(row.api_key_id);
    return {
      id: row.id,
      username: row.username,
      email: row.email,
      authVersion: row.auth_version,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async markApiKeyUsed(apiKeyId: string): Promise<void> {
    await this.sql`
      UPDATE api_keys
      SET last_used_at = NOW()
      WHERE id = ${apiKeyId}
    `;
  }

  async transaction<T>(fn: (tx: any) => Promise<T>): Promise<T> {
    return this.sql.begin(fn) as unknown as Promise<T>;
  }
}

function mapApiKeyRow(row: any): ApiKeyRow {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    keyHash: row.key_hash,
    keyPrefix: row.key_prefix,
    keyVal: row.key_val ?? null,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at ?? null,
    revokedAt: row.revoked_at ?? null,
  };
}
