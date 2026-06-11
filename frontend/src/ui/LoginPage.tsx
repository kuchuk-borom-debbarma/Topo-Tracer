import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { ApiError, finishSignUp, login, startSignUp } from "../api";
import { setToken } from "../auth";
import { Icon } from "./Icon";

type AuthMode = "signin" | "signup";

export function LoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<AuthMode>("signin");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [signupToken, setSignupToken] = useState<string | null>(null);
  const [signupComplete, setSignupComplete] = useState(false);

  const loginMutation = useMutation({
    mutationFn: login,
    onSuccess: ({ token }) => {
      setToken(token);
      navigate({ to: "/traces", search: { page: 1 }, replace: true });
    },
  });

  const startSignupMutation = useMutation({
    mutationFn: startSignUp,
    onSuccess: ({ token }) => {
      setSignupToken(token);
      setSignupComplete(false);
    },
  });

  const finishSignupMutation = useMutation({
    mutationFn: finishSignUp,
    onSuccess: () => {
      setSignupComplete(true);
      setMode("signin");
      setSignupToken(null);
      setOtp("");
      setPassword("");
    },
  });

  const authError =
    loginMutation.error ??
    startSignupMutation.error ??
    finishSignupMutation.error;

  const isBusy =
    loginMutation.isPending ||
    startSignupMutation.isPending ||
    finishSignupMutation.isPending;

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setSignupToken(null);
    setOtp("");
    setSignupComplete(false);
    loginMutation.reset();
    startSignupMutation.reset();
    finishSignupMutation.reset();
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (mode === "signin") {
      loginMutation.mutate({ email, password });
      return;
    }

    if (signupToken) {
      finishSignupMutation.mutate({ token: signupToken, otp });
      return;
    }

    startSignupMutation.mutate({ username, email, password });
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
        <form className="login-form" onSubmit={handleSubmit}>
          <div className="login-heading">
            <span className="overline">Workspace access</span>
            <h2>{mode === "signin" ? "Sign in" : "Create account"}</h2>
            <p>
              {mode === "signin"
                ? "Use your account credentials to open the trace explorer."
                : "Create an account, then enter the verification code sent by the backend."}
            </p>
          </div>

          {signupComplete && (
            <div className="form-success">
              Account verified. Sign in with your new credentials.
            </div>
          )}

          <div className="auth-toggle" role="tablist" aria-label="Authentication mode">
            <button
              type="button"
              className={mode === "signin" ? "active" : ""}
              onClick={() => switchMode("signin")}
              aria-selected={mode === "signin"}
              role="tab"
            >
              Sign in
            </button>
            <button
              type="button"
              className={mode === "signup" ? "active" : ""}
              onClick={() => switchMode("signup")}
              aria-selected={mode === "signup"}
              role="tab"
            >
              Create account
            </button>
          </div>

          {mode === "signup" && !signupToken && (
            <label className="field">
              <span>Username</span>
              <input
                type="text"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="Your display name"
                autoComplete="username"
                required
              />
            </label>
          )}

          <label className="field">
            <span>Email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@company.com"
              autoComplete="email"
              disabled={mode === "signup" && Boolean(signupToken)}
              required
            />
          </label>

          {!(mode === "signup" && signupToken) && (
            <label className="field">
              <span>Password</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter your password"
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                required
              />
            </label>
          )}

          {mode === "signup" && signupToken && (
            <label className="field">
              <span>Verification code</span>
              <input
                type="text"
                value={otp}
                onChange={(event) => setOtp(event.target.value)}
                placeholder="Enter OTP"
                autoComplete="one-time-code"
                required
              />
            </label>
          )}

          {authError && (
            <div className="form-error">
              {authError instanceof ApiError
                ? authError.message
                : "Unable to complete authentication. Check the backend connection."}
            </div>
          )}

          <button className="button primary login-button" disabled={isBusy}>
            {mode === "signin" && (loginMutation.isPending ? "Signing in..." : "Enter workspace")}
            {mode === "signup" && !signupToken && (
              startSignupMutation.isPending ? "Creating account..." : "Send verification code"
            )}
            {mode === "signup" && signupToken && (
              finishSignupMutation.isPending ? "Verifying..." : "Verify account"
            )}
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
