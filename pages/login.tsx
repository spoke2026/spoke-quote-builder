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

      <main className="login-shell">
        <section className="login-panel" aria-labelledby="login-title">
          <img
            src="/spoke-logo-landscape-white.png"
            alt="Spoke"
            className="login-logo"
          />

          <div className="login-intro">
            <p className="login-eyebrow">Quote builder</p>
            <h1 id="login-title" className="login-title">
              Let&rsquo;s build a quote.
            </h1>
            <p className="login-lede">Sign in to build and send customer quotes.</p>
          </div>

          <form className="login-form" onSubmit={handleSubmit} noValidate>
            <label htmlFor="email" className="login-label">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              inputMode="email"
              className="login-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
              autoFocus
            />

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

            {error ? (
              <p className="login-alert" role="alert">
                {error}
              </p>
            ) : null}

            <button type="submit" className="login-btn" disabled={submitting}>
              {submitting ? "Signing in" : "Sign in"}
            </button>
          </form>

          <p className="login-footnote">Authorised users only.</p>
        </section>
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
        .login-shell {
          font-family: "DM Sans", system-ui, -apple-system, sans-serif;
          min-height: 100svh;
          background: #40514f;
          color: #ffffff;
          display: grid;
          place-items: center;
          padding: clamp(1.25rem, 4vw, 3rem);
          position: relative;
          overflow: hidden;
        }
        .login-shell::before {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(
              120deg,
              rgba(255, 255, 255, 0.025),
              transparent 45%
            ),
            radial-gradient(
              circle at 88% 12%,
              rgba(190, 218, 129, 0.13),
              transparent 34%
            );
          pointer-events: none;
        }
        .login-panel {
          width: min(100%, 29rem);
          position: relative;
          z-index: 1;
        }
        .login-logo {
          width: 10rem;
          height: auto;
          display: block;
          margin-bottom: clamp(3rem, 9vh, 5.5rem);
        }
        .login-intro {
          margin-bottom: 2rem;
        }
        .login-eyebrow {
          margin: 0 0 0.8rem;
          color: #beda81;
          text-transform: uppercase;
          letter-spacing: 0.14em;
          font-size: 0.72rem;
          font-weight: 700;
        }
        .login-title {
          margin: 0;
          font-family: "DM Sans", system-ui, -apple-system, sans-serif;
          font-style: normal;
          font-size: clamp(2.5rem, 9vw, 4.5rem);
          line-height: 0.98;
          letter-spacing: -0.055em;
          font-weight: 650;
          color: #ffffff;
        }
        .login-lede {
          margin: 1rem 0 0;
          color: rgba(255, 255, 255, 0.68);
          font-size: 1rem;
          line-height: 1.55;
        }
        .login-form {
          display: grid;
          gap: 0.65rem;
        }
        .login-label {
          margin-top: 0.55rem;
          font-size: 0.78rem;
          font-weight: 650;
          color: rgba(255, 255, 255, 0.78);
        }
        .login-input {
          width: 100%;
          min-height: 3.35rem;
          border: 1px solid rgba(255, 255, 255, 0.25);
          border-radius: 0;
          background: rgba(255, 255, 255, 0.06);
          color: #ffffff;
          padding: 0.85rem 1rem;
          font-family: "DM Sans", system-ui, -apple-system, sans-serif;
          font-size: 1rem;
          outline: none;
          transition: border-color 160ms ease, background 160ms ease,
            box-shadow 160ms ease;
        }
        .login-input:hover {
          border-color: rgba(255, 255, 255, 0.42);
        }
        .login-input:focus {
          border-color: #beda81;
          background: rgba(255, 255, 255, 0.085);
          box-shadow: 0 0 0 3px rgba(190, 218, 129, 0.16);
        }
        .login-btn {
          width: 100%;
          min-height: 3.35rem;
          margin-top: 0.9rem;
          border: 0;
          border-radius: 0;
          background: #beda81;
          color: #28332f;
          font-family: "DM Sans", system-ui, -apple-system, sans-serif;
          font-size: 1rem;
          font-weight: 700;
          cursor: pointer;
          transition: transform 150ms ease, background 150ms ease;
        }
        .login-btn:hover:not(:disabled) {
          background: #cbe39a;
        }
        .login-btn:active:not(:disabled) {
          transform: translateY(1px);
        }
        .login-btn:focus-visible {
          outline: 3px solid #ffffff;
          outline-offset: 3px;
        }
        .login-btn:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }
        .login-alert {
          margin: 0.65rem 0 0;
          padding: 0.8rem 0;
          color: #f5d8d2;
          font-size: 0.86rem;
          border-top: 1px solid rgba(245, 216, 210, 0.24);
          border-bottom: 1px solid rgba(245, 216, 210, 0.24);
        }
        .login-footnote {
          margin: 1.4rem 0 0;
          font-size: 0.72rem;
          color: rgba(255, 255, 255, 0.42);
        }
        @media (max-width: 520px) {
          .login-shell {
            place-items: start stretch;
            padding-top: max(2rem, env(safe-area-inset-top));
          }
          .login-panel {
            width: 100%;
            min-height: calc(100svh - 4rem);
            display: flex;
            flex-direction: column;
          }
          .login-logo {
            margin-bottom: auto;
            padding-top: 0.5rem;
          }
          .login-intro {
            margin-top: 4rem;
          }
          .login-footnote {
            padding-bottom: max(0.5rem, env(safe-area-inset-bottom));
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .login-shell *,
          .login-shell *::before,
          .login-shell *::after {
            transition-duration: 0.01ms !important;
          }
        }
      `}</style>
    </>
  );
}
