import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { ApiError, login } from "../api";
import { setToken } from "../auth";
import { Icon } from "./Icon";

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const mutation = useMutation({
    mutationFn: login,
    onSuccess: ({ token }) => {
      setToken(token);
      navigate({ to: "/traces", search: { page: 1 }, replace: true });
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    mutation.mutate({ email, password });
  };

  return (
    <main className="login-page">
      <section className="login-visual">
        <div className="login-grid" />
        <div className="login-brand">
          <div className="brand-symbol large"><Icon name="graph" /></div>
          <span>TOPO TRACER</span>
        </div>
        <div className="login-message">
          <span className="overline light">Trace intelligence at scale</span>
          <h1>See the system.<br />Follow the <em>signal.</em></h1>
          <p>
            Explore million-node traces through bounded, importance-aware graph
            projections built for focus.
          </p>
          <div className="login-proof">
            <span><Icon name="layers" /> Threshold projections</span>
            <span><Icon name="shield" /> Tenant-isolated reads</span>
            <span><Icon name="activity" /> Live materialization</span>
          </div>
        </div>
        <div className="orbit orbit-one" />
        <div className="orbit orbit-two" />
      </section>

      <section className="login-panel">
        <form className="login-form" onSubmit={submit}>
          <div className="login-heading">
            <span className="overline">Workspace access</span>
            <h2>Welcome back</h2>
            <p>Sign in to inspect your latest trace read models.</p>
          </div>

          <label className="field">
            <span>Email address</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@company.com"
              autoComplete="email"
              required
            />
          </label>
          <label className="field">
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter your password"
              autoComplete="current-password"
              required
            />
          </label>

          {mutation.isError && (
            <div className="form-error">
              {mutation.error instanceof ApiError
                ? mutation.error.message
                : "Unable to sign in. Check the backend connection."}
            </div>
          )}

          <button className="button primary login-button" disabled={mutation.isPending}>
            {mutation.isPending ? "Signing in..." : "Enter workspace"}
            <Icon name="arrow-right" />
          </button>

          <div className="login-security">
            <Icon name="shield" />
            <span>Your session is stored locally and sent only to the configured Hono API.</span>
          </div>
        </form>
      </section>
    </main>
  );
}
