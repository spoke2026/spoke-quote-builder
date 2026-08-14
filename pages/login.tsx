import React, { useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { createClient } from "@/lib/supabase/client";

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        // Generic message only — never reveal whether the email exists.
        setError("Email or password is wrong. Try again.");
        setSubmitting(false);
        return;
      }

      // Session is now in cookies; middleware can see it. Land on the builder.
      window.location.assign("/");
    } catch {
      setError("Email or password is wrong. Try again.");
      setSubmitting(false);
    }
  }

  return (
    <>
      <Head>
        <title>Log in — Spoke Quote Builder</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </Head>

      <main className="login-screen">
        <div className="login-card">
          <img
            src="/spoke-logo-landscape-white.png"
            alt="Spoke"
            className="login-logo"
          />
          <div className="login-subtitle">Quote Builder</div>

          <form className="login-form" onSubmit={handleSubmit} noValidate>
            {error ? (
              <p className="login-alert" role="alert">
                {error}
              </p>
            ) : null}

            <div className="login-field">
              <label htmlFor="email" className="login-label">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                className="login-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
                autoFocus
              />
            </div>

            <div className="login-field">
              <label htmlFor="password" className="login-label">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                className="login-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>

            <button type="submit" className="login-btn" disabled={submitting}>
              {submitting ? "Logging in" : "Log in"}
            </button>
          </form>
        </div>
      </main>

      <style jsx global>{`
        *,
        *::before,
        *::after {
          box-sizing: border-box;
        }
        html,
        body {
          margin: 0;
          padding: 0;
        }
      `}</style>

      <style jsx>{`
        .login-screen {
          font-family: "DM Sans", system-ui, sans-serif;
          min-height: 100vh;
          background: #40514f;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
        }
        .login-card {
          width: 100%;
          max-width: 360px;
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        .login-logo {
          height: 44px;
          width: auto;
          display: block;
        }
        .login-subtitle {
          font-size: 11px;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: rgba(255, 255, 255, 0.5);
          margin-top: 10px;
          margin-bottom: 28px;
        }
        .login-form {
          width: 100%;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .login-alert {
          margin: 0;
          background: rgba(255, 120, 120, 0.12);
          border: 1px solid rgba(255, 120, 120, 0.4);
          color: #ffb3b3;
          border-radius: 8px;
          padding: 10px 12px;
          font-size: 13px;
        }
        .login-field {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .login-label {
          font-size: 13px;
          font-weight: 500;
          color: rgba(255, 255, 255, 0.85);
        }
        .login-input {
          width: 100%;
          height: 40px;
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 8px;
          color: #fff;
          padding: 0 12px;
          font-family: "DM Sans", system-ui, sans-serif;
          font-size: 14px;
          outline: none;
        }
        .login-input:focus {
          border-color: #beda81;
          box-shadow: 0 0 0 3px rgba(147, 175, 82, 0.45);
        }
        .login-btn {
          height: 40px;
          background: #beda81;
          color: #40514f;
          border: none;
          border-radius: 8px;
          font-family: "DM Sans", system-ui, sans-serif;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          margin-top: 4px;
        }
        .login-btn:hover:not(:disabled) {
          background: #b0d06b;
        }
        .login-btn:focus-visible {
          outline: none;
          box-shadow: 0 0 0 3px rgba(147, 175, 82, 0.45);
        }
        .login-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
      `}</style>
    </>
  );
}
