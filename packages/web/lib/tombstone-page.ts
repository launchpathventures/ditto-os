/**
 * Neutral tombstone page (Brief 284, R-Q11, Insight-234 #4).
 *
 * A single inline HTML string used by both the middleware (true HTTP 410) and
 * the public profile page (200 fallback when middleware was bypassed). The
 * body reveals NOTHING about prior content: no prior name, no prior role, no
 * "claim this profile" affordance. Anti-resurrection.
 */

export const TOMBSTONE_NEUTRAL_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="robots" content="noindex,nofollow" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Profile removed</title>
    <style>
      :root { color-scheme: light dark; }
      body {
        margin: 0;
        padding: 0;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        background: #f6f5f1;
        color: #1a1a1a;
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      main {
        max-width: 32rem;
        padding: 2.5rem 2rem;
        text-align: center;
      }
      h1 {
        font-size: 1.25rem;
        font-weight: 500;
        margin: 0 0 0.75rem;
        letter-spacing: 0.01em;
      }
      p {
        font-size: 0.95rem;
        line-height: 1.55;
        margin: 0;
        color: #4a4a4a;
      }
      @media (prefers-color-scheme: dark) {
        body { background: #15161a; color: #e8e8e8; }
        p { color: #b4b4b4; }
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Profile removed</h1>
      <p>This profile is no longer available.</p>
    </main>
  </body>
</html>
`;
