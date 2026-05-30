/**
 * GET /api/v1/network/people/:id/badge.png — Brief 290 (Q8).
 *
 * Backs the website-badge `<img src>`. Content-free by design (AC 9): the
 * rendered pixels are byte-identical regardless of card content, so the
 * snippet stays cacheable and stable. No DB load, no card content, no rate
 * limit needed — the output does not vary by handle. The `:id` segment is
 * kept only so the badge URL lives under the same canonical people path as
 * the other share assets.
 */

import * as React from "react";
import { ImageResponse } from "next/og";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WIDTH = 200;
const HEIGHT = 40;

export async function GET() {
  try {
    const response = new ImageResponse(
      React.createElement(
        "div",
        {
          style: {
            display: "flex",
            width: `${WIDTH}px`,
            height: `${HEIGHT}px`,
            alignItems: "center",
            gap: "8px",
            padding: "0 14px",
            background: "#fffdfa",
            border: "1px solid #ecebe8",
            borderRadius: "999px",
            fontFamily: "Geist, Arial, sans-serif",
          },
        },
        React.createElement("div", {
          style: {
            display: "flex",
            width: "10px",
            height: "10px",
            borderRadius: "999px",
            background: "#ff4000",
          },
        }),
        React.createElement(
          "div",
          {
            style: {
              display: "flex",
              color: "#1c1c1c",
              fontSize: "14px",
              fontWeight: 600,
              letterSpacing: "0.01em",
            },
          },
          "Available through Ditto",
        ),
      ),
      { width: WIDTH, height: HEIGHT },
    );
    response.headers.set("Cache-Control", "public, max-age=86400, immutable");
    return response;
  } catch (error) {
    console.error("[/api/v1/network/people/:id/badge.png] Error:", error);
    return NextResponse.json({ error: "badge_png_failed" }, { status: 500 });
  }
}
