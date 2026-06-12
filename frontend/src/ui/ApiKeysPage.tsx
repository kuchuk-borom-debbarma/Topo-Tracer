import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { createApiKey, fetchApiKeys, revokeApiKey } from "../api";
import { formatDate, relativeTime } from "../utils";
import { Icon } from "./Icon";

export function ApiKeysPage() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [createdKey, setCreatedKey] = useState<string | null>(null);

  const apiKeysQuery = useQuery({
    queryKey: ["api-keys"],
    queryFn: fetchApiKeys,
  });

  const createMutation = useMutation({
    mutationFn: createApiKey,
    onSuccess: (result) => {
      setCreatedKey(result.apiKey.key);
      setName("");
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: revokeApiKey,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
    },
  });

  const apiKeys = apiKeysQuery.data?.apiKeys ?? [];
  const activeKeys = apiKeys.filter((apiKey) => !apiKey.revokedAt);

  return (
    <main className="api-keys-page">
      <header className="api-keys-header">
        <div>
          <span className="overline">SDK access</span>
          <h1>API keys</h1>
        </div>
        <div className="metric-pill">
          <Icon name="shield" />
          {activeKeys.length} active
        </div>
      </header>

      <section className="api-key-create-panel">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            createMutation.mutate({ name });
          }}
        >
          <label htmlFor="api-key-name">Name</label>
          <div className="api-key-create-row">
            <input
              id="api-key-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Production SDK"
              maxLength={80}
            />
            <button className="button primary" type="submit" disabled={!name.trim() || createMutation.isPending}>
              Create key
            </button>
          </div>
          {createMutation.isError && (
            <p className="form-error">{createMutation.error.message}</p>
          )}
        </form>
      </section>

      {createdKey && (
        <section className="api-key-created">
          <div>
            <span className="overline">New key</span>
            <code>{createdKey}</code>
          </div>
          <button
            className="icon-button"
            type="button"
            title="Copy key"
            onClick={() => navigator.clipboard.writeText(createdKey)}
          >
            <Icon name="external" />
          </button>
        </section>
      )}

      <section className="api-key-list">
        {apiKeysQuery.isLoading && <p className="muted-text">Loading keys...</p>}
        {apiKeysQuery.isError && <p className="form-error">{apiKeysQuery.error.message}</p>}
        {!apiKeysQuery.isLoading && !apiKeysQuery.isError && apiKeys.length === 0 && (
          <div className="empty-state compact">
            <div className="empty-icon"><Icon name="shield" /></div>
            <h3>No API keys</h3>
          </div>
        )}
        {apiKeys.map((apiKey) => (
          <article className="api-key-row" key={apiKey.id}>
            <div>
              <strong>{apiKey.name}</strong>
              <small>
                {apiKey.keyPrefix}... · Created {formatDate(Date.parse(apiKey.createdAt))}
                {apiKey.lastUsedAt ? ` · Used ${relativeTime(Date.parse(apiKey.lastUsedAt))}` : ""}
              </small>
            </div>
            {apiKey.revokedAt ? (
              <span className="status-pill stopped">Revoked</span>
            ) : (
              <button
                className="button subtle"
                type="button"
                disabled={revokeMutation.isPending}
                onClick={() => revokeMutation.mutate(apiKey.id)}
              >
                Revoke
              </button>
            )}
          </article>
        ))}
      </section>
    </main>
  );
}
