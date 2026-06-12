import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { createApiKey, fetchApiKeys, revokeApiKey } from "../api";
import { formatDate, relativeTime } from "../utils";

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

  return (
    <main className="api-keys-page settings-page">
      <section className="settings-section">
        <div className="settings-section-heading">
          <h2>API keys</h2>
          <span>{apiKeys.filter((apiKey) => !apiKey.revokedAt).length} active</span>
        </div>

        <form
          className="settings-create-row"
          onSubmit={(event) => {
            event.preventDefault();
            createMutation.mutate({ name });
          }}
        >
          <label htmlFor="api-key-name">Name</label>
          <input
            id="api-key-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Production SDK"
            maxLength={80}
          />
          <button className="button primary" type="submit" disabled={!name.trim() || createMutation.isPending}>
            Create
          </button>
        </form>

        {createMutation.isError && <p className="form-error">{createMutation.error.message}</p>}

        {createdKey && (
          <div className="created-key-row">
            <span>New key</span>
            <code>{createdKey}</code>
            <button className="button subtle" type="button" onClick={() => navigator.clipboard.writeText(createdKey)}>
              Copy
            </button>
          </div>
        )}
      </section>

      <section className="settings-section">
        <div className="settings-section-heading">
          <h3>Keys</h3>
        </div>

        {apiKeysQuery.isLoading && <p className="muted-copy">Loading keys...</p>}
        {apiKeysQuery.isError && <p className="form-error">{apiKeysQuery.error.message}</p>}

        {!apiKeysQuery.isLoading && !apiKeysQuery.isError && apiKeys.length === 0 && (
          <div className="settings-empty-row">No API keys</div>
        )}

        {apiKeys.map((apiKey) => (
          <article className="settings-list-row" key={apiKey.id}>
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
