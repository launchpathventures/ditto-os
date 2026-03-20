# Research: Mobile Interfaces for AI Agent Platforms

**Date:** 2026-03-19
**Status:** complete
**Researcher:** Dev Researcher

---

## 1. Mobile-First Agent Management Apps

### Paperclip (paperclipai/paperclip)

- **Source:** https://github.com/paperclipai/paperclip, https://paperclip.ing
- **Stars:** ~29,300. TypeScript. MIT license. Created 2026-03-02.
- **Description:** "Open-source orchestration for zero-human companies." Node.js server with embedded PostgreSQL and a React UI dashboard.
- **Mobile experience:** Explicitly described as "Mobile Ready" — "Monitor and manage your autonomous businesses from anywhere." This appears to be responsive web design rather than a dedicated native app or PWA. No evidence of a native mobile app or app store listing.
- **Human-agent interaction model:** Ticket-based, not continuous chat. Humans function as "board of directors." Approval gates for agent hiring and strategy changes. Dashboard oversight for reviewing completed work. Budget enforcement stops agents when spending limits hit. Manual overrides: pause, resume, override, reassign, or terminate agents at any time. "Autonomy is a privilege you grant, not a default."
- **Interfaces:** Web dashboard (React), CLI (`npx paperclipai onboard`), REST API at port 3100. No evidence of Slack/Teams integration, mobile push notifications, or messaging bot interfaces.

### Linear Mobile

- **Source:** https://linear.app/mobile
- **Native app:** Fully native — Swift (iOS), Kotlin (Android). Not a web wrapper or PWA.
- **Mobile capabilities:** Purpose-built inbox for notifications with tap-to-act, swipe-to-delete, snooze. Quick issue creation via optimized mobile composer. Screenshot/photo sharing to create issues or bug reports. Real-time collaboration and discussion on issue details. Read/write project updates and review product specs in mobile-optimized format. Customizable notification schedules for focus periods.
- **Design philosophy:** "Ultraportable" — a "portable companion to the Linear system." Focuses on reactive work and quick updates rather than comprehensive project management. Complements rather than replaces the desktop experience.
- **Relevance to agent management:** Linear is already integrated as a trigger surface by Open SWE (see below). Its mobile triage patterns (inbox, swipe, quick creation) are directly relevant to agent approval flows.

### Asana / Monday.com Mobile

- **Source:** Marketing pages returned 404s during research; details drawn from general product knowledge.
- **Both offer native iOS and Android apps** with task management, status updates, and comment threads on mobile.
- **Asana** has an Approvals feature where designated approvers can approve, request changes, or reject from the mobile app. Tasks can have an "Approval" type with Approved/Rejected/Changes Requested states.
- **Monday.com** mobile app supports status column updates, which serve as lightweight approval (e.g., changing a status from "Pending Review" to "Approved"). Board views are adapted for mobile with condensed layouts.

### Slack/Teams Bots for AI Agents

**Slack as agent interface:**
- **Source:** https://docs.slack.dev, Slack Block Kit documentation
- Slack's Block Kit provides interactive components: buttons, select menus, overflow menus, modals, radio buttons, checkboxes, date pickers. These work identically on desktop and mobile Slack apps.
- Workflow Builder enables no-code automation, including approval flows, directly in Slack.
- Workspace owners can enforce app approval processes — members submit requests, decisions delivered via Slackbot DM.
- Block Kit's interactive messages enable inline approve/reject buttons, dropdown selections, and modal dialogs — all functional on mobile.
- Slack has "Agentforce" (Salesforce integration) and "Slack AI" as native features, though detailed agent interaction patterns were not available from the documentation.

**Microsoft Teams agents:**
- **Source:** https://learn.microsoft.com/en-us/copilot/microsoft-365/microsoft-365-copilot-overview
- Microsoft 365 Copilot works across Teams, Word, Excel, Outlook — including mobile versions of these apps.
- "Microsoft Agents" are scoped Copilot instances that automate business processes (help desk tickets, HR queries, shipping status).
- Users interact with agents via chat in Teams (which has a full mobile app).
- No evidence of dedicated approval flow components for agent outputs in Teams, beyond standard chat interaction.

### AI Coding Tools with Mobile Experiences

**Claude Mobile App:**
- **Source:** https://claude.com/download
- Available on iOS and Android.
- Conversation history syncs across phone, desktop, and web.
- **"Remote Control" feature:** Send tasks from phone to Claude Code CLI. Access local development environment from mobile.
- **Cowork pairing:** Share a task from phone, Claude can start working on desktop. Mobile as companion/trigger for more powerful desktop processing.
- This is the closest existing example of a mobile app that triggers and monitors agent work on a separate machine.

**GitHub Mobile + Copilot:**
- **Source:** https://github.com/mobile
- Native app for iOS and Android.
- PR review from mobile: review code diffs, approve/reject merges, leave comments.
- **Copilot integration on mobile:** Chat with Copilot about code. Assign Copilot as automated PR reviewer from phone. Manage Copilot coding agent tasks — assign issues to Copilot for automated PR generation. Global code search via Copilot.
- Notification system for actions requiring attention.
- This demonstrates managing an AI coding agent's work products (PRs) from a phone, including assignment, review, and approval.

**Cursor / Other AI coding tools:**
- No evidence of mobile experiences found. Cursor, Windsurf, and similar tools are desktop-only IDEs. No mobile companion apps or web interfaces discovered.

### Open SWE (langchain-ai/open-swe)

- **Source:** https://github.com/langchain-ai/open-swe
- MIT-licensed framework for building internal coding agents. Architecture inspired by Stripe, Ramp, Coinbase internal tools.
- **Slack as primary interface:** Users @mention the bot in any Slack thread. Agent responds with status updates and PR links inline. Bot immediately reacts with eyes emoji to signal task pickup.
- **Mid-execution messaging:** Users can message the agent while it's working. Middleware injects follow-up messages before the next model call, enabling dynamic task adjustment.
- **Linear integration:** Comment `@openswe` on Linear issues. Agent reads full issue context, acknowledges with emoji, posts results as comments.
- **GitHub integration:** Tag `@openswe` in PR comments to address review feedback.
- **Mobile relevance:** Because Slack and Linear both have full-featured mobile apps, users can trigger, monitor, and redirect agents entirely from their phone via these existing surfaces. No custom mobile interface needed.

---

## 2. PWA vs Native for Agent Dashboards

### iOS PWA Support (Web Push)

- **Source:** https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/
- Web Push arrived in iOS/iPadOS 16.4 (February 2023) for Home Screen web apps.
- Uses W3C standards: Push API, Notifications API, Service Workers.
- Notifications appear on Lock Screen, Notification Center, and paired Apple Watch.
- Badging API supports badge counts on home screen icons.
- Focus mode integration — notifications respect Focus settings, synced across devices.
- No Apple Developer Program membership required for web push.
- Server must allow URLs from `*.push.apple.com`.
- Users must explicitly grant permission via a user gesture (tap on a subscribe button).
- **Key limitation:** PWA must be added to Home Screen first; push does not work from Safari browser alone.

### Android PWA Push Notifications

- **Source:** https://developer.android.com/develop/ui/views/notifications/notification-permission
- Android 13+ requires runtime `POST_NOTIFICATIONS` permission. Notifications are off by default for new installs.
- PWA push notifications have been well-supported on Android for years (via Chrome/Edge service workers).
- Action buttons in notifications allow direct interaction (approve/reject) without opening the app.
- Direct reply from notifications is supported natively.

### PWA Success Stories

- **Source:** https://web.dev/explore/progressive-web-apps
- Clipchamp (video editor PWA): 97% monthly growth in installations.
- Gravit Designer: PWA users 2.5x more likely to purchase PRO.
- JD.ID: Mobile conversion rates improved 53% with caching, installation, push.
- Rakuten 24: User retention increased 450%.
- Goibibo: Conversions improved 60%.
- These are all consumer/e-commerce examples. No notable B2B/business tool PWA success stories found in the sources.

### PWA vs Native Trade-offs (Current State)

| Capability | PWA | Native |
|------------|-----|--------|
| Push notifications (iOS) | Supported since 16.4, requires Home Screen install | Full support |
| Push notifications (Android) | Full support via service workers | Full support |
| Offline | Service worker caching; can be robust but developer-managed | Full OS-level caching, background sync |
| WebSocket reliability | Works but may be killed by OS power management on mobile; no guaranteed background keep-alive | Can use persistent connections, background modes |
| Install prompt | Chrome on Android shows install prompt; iOS requires manual "Add to Home Screen" | App store discovery |
| Background processing | Very limited; service workers can wake for push but cannot run arbitrary background tasks | Full background mode support |
| Biometric auth | WebAuthn/passkeys work | Full Face ID/Touch ID integration |
| File system access | Limited (File System Access API, not on iOS Safari) | Full |
| App store presence | Can be wrapped for stores via PWABuilder | Native listing |
| Development cost | Single codebase | Platform-specific (or React Native/Flutter) |

### WebSocket Reliability on Mobile

- No authoritative source found specifically benchmarking WebSocket reliability on mobile PWAs vs native.
- General pattern: mobile browsers aggressively suspend background tabs and service workers. WebSocket connections in a PWA that is not in the foreground will likely be dropped by the OS within seconds to minutes.
- Native apps can request background execution modes (iOS: background fetch, background processing; Android: foreground service) to maintain connections longer.
- For agent dashboards: real-time updates via WebSocket work well while the user is actively viewing the app. For background notifications, push notifications (not WebSockets) are the correct mechanism on both PWA and native.

---

## 3. Mobile Approval/Review Patterns

### Swipe-Based Triage

**Linear Mobile:**
- Tap to take action, swipe to delete, snooze to deal with it later.
- Inbox-centric model where items flow in and are triaged via gestures.

**Email apps (Gmail, Apple Mail, Outlook):**
- Gmail mobile: configurable swipe actions — swipe right/left to archive, delete, snooze, mark read/unread, or move. Actions are customizable per direction.
- Apple Mail: swipe right for mark-read/flag, swipe left for archive/trash/flag. Customizable.
- These triage patterns are the most established mobile gesture vocabulary. Users already understand "swipe to act on a list item."

**Apple Human Interface Guidelines (swipe actions):**
- HIG page was not loadable during research, but the established pattern is: swipe to reveal action buttons behind a list row. Leading swipe for constructive actions (mark read, flag), trailing swipe for destructive or dismissive actions (delete, archive). Full swipe for primary action.

### Reviewing Complex Outputs on Small Screens

**GitHub Mobile PR review:**
- Code diffs are displayed on mobile with horizontal scrolling for wide lines.
- File-by-file navigation (not full diff view).
- Approve, request changes, or comment — same three-state model as desktop but with simplified touch-friendly UI.
- Copilot can be assigned as reviewer to pre-filter what the human needs to look at.

**General patterns observed:**
- **Summary-first, detail-on-demand:** Mobile tools show summaries (PR title, changed files count, CI status) with drill-down to full diffs.
- **Threaded comments:** Inline comments on specific lines work on mobile but are harder to compose.
- **Binary decisions surfaced early:** Approve/reject buttons are prominent; detailed review is optional.
- **AI-assisted pre-review:** GitHub Mobile + Copilot demonstrates the pattern of having AI review first, then surfacing only what needs human attention — reducing the volume of content a mobile reviewer must examine.

### Actionable Notifications

**iOS:**
- Apps can define notification categories with custom action buttons (e.g., "Approve" / "Reject" buttons directly on a notification).
- Users can act without opening the app.
- Siri Shortcuts / App Intents allow voice-triggered actions: "Approve the latest deployment" could be implemented via App Intents on iOS 17+.

**Android:**
- Notification action buttons: up to 3 custom action buttons per notification.
- Direct reply from notification supported.
- PWAs can include action buttons in push notifications.

### Voice-Based Review

**Apple Siri + App Intents:**
- **Source:** https://developer.apple.com/siri/
- Apps can expose actions to Siri via App Intents framework.
- iOS 17+: Siri recognizes phrase variations (e.g., "Scan files" also triggers for "Scan page").
- SiriKit domains include messaging, lists, payments — custom intents can be created for arbitrary actions.
- A native app could expose "approve task," "reject task," "show pending reviews" as Siri Shortcuts.
- PWAs cannot register Siri Shortcuts or App Intents.

**Android voice:**
- Google Assistant can invoke app actions via App Actions.
- Similar capability: apps can register actions that Google Assistant can trigger by voice.
- PWAs have no equivalent voice integration path.

**Alexa / Google Home:**
- No evidence found of AI agent management tools integrating with smart speakers for approval flows.

---

## 4. Secure Remote Access for Self-Hosted Tools

### Home Assistant Remote Access Model

- **Source:** https://www.home-assistant.io/docs/configuration/remote/
- Three approaches supported:
  1. **Home Assistant Cloud (Nabu Casa):** Paid cloud relay service. Automatic HTTPS, unique URL, zero configuration. Traffic encrypted end-to-end through Nabu Casa's relay servers. The mobile companion app connects through this relay automatically when away from local network.
  2. **VPN (Tailscale, ZeroTier):** Secure tunnel to home network. Mobile companion app requires this connection for sensor updates when remote. User installs Tailscale on both phone and HA server; they join the same tailnet.
  3. **Port forwarding + reverse proxy:** Manual setup. Requires HTTPS via Let's Encrypt. Documentation warns: "Just putting a port up is not secure."
- **Authentication:** Long-lived access tokens, user accounts with passwords. Mobile app stores auth token after initial pairing.
- **Mobile companion app:** Used by 85% of active installations. Native iOS and Android. Local Push IoT class. Handles push notifications, location tracking, sensor data.

### Tailscale

- **Source:** https://tailscale.com/kb/1017/install, https://tailscale.com/kb/1223/funnel
- **How it works:** Creates a private mesh network ("tailnet") using WireGuard. Each device gets a stable 100.x.y.z IP. NAT traversal handles firewalls automatically. MagicDNS for human-readable names.
- **Platforms:** Windows, macOS, Linux, iOS, Android, Apple TV.
- **Zero-trust model:** ACLs and grants define per-device, per-user access policies. All traffic encrypted via WireGuard.
- **Mobile access pattern:** Install Tailscale on phone, authenticate, device joins tailnet. Access home server by MagicDNS name (e.g., `server.tailnet-name.ts.net`). Works behind any firewall, anywhere in the world.
- **Tailscale Funnel:** Exposes local services to the public internet through Tailscale's relay servers. Creates encrypted tunnel with unique URL. Relay servers cannot decrypt traffic (end-to-end encryption). Only ports 443, 8443, 10000. Useful for sharing with users outside the tailnet. Distinct from regular Tailscale — Funnel is public, Tailscale is private.

### Cloudflare Tunnel + Access

- **Source:** https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/, https://developers.cloudflare.com/cloudflare-one/applications/configure-apps/self-hosted-apps/
- **Cloudflare Tunnel:** Lightweight daemon (`cloudflared`) creates outbound-only connections to Cloudflare's global network. No public IP or port forwarding needed. Outbound-only model means no inbound attack surface. Traffic flows bidirectionally once tunnel established.
- **Cloudflare Access:** Authentication layer in front of self-hosted apps. "All Access applications are deny by default." Supports identity provider (IdP) SSO — single IdP triggers direct redirect ("Instant Auth"). Also supports WARP session identity and service tokens for machine-to-machine access. Token validated on every HTTP request.
- **Zero-trust model:** User authenticates through identity provider, Cloudflare validates, then proxies to origin through the tunnel. Origin never exposed to internet directly.
- **For single-user/small-team:** Can use one-time PIN (email-based), GitHub/Google OAuth, or SAML. Free tier available for up to 50 users.

### Authentication Patterns for Mobile Access

**Passkeys:**
- **Source:** https://www.passkeys.io/
- Joint initiative of Apple, Google, Microsoft.
- 400% better conversion than passwords; 200% faster logins.
- iOS: full support across Safari, Chrome, Brave, Edge, Firefox, and native apps. Uses Face ID/Touch ID.
- Android: full support across Chrome, Brave, Edge, Firefox, and apps.
- Cross-device auth: scan QR code on phone to authenticate on another device.
- Desktop support varies — macOS Safari full, Windows browsers lack passkey sync.
- Adopted by Google, PayPal, Shopify, KAYAK, Adobe, Robinhood, Amazon.
- **Relevance:** Passkeys are the emerging standard for mobile-first auth. They work for both native apps and web/PWA. They replace both passwords and traditional TOTP 2FA.

**Session tokens vs API keys:**
- Session tokens (JWT or opaque): standard for web/mobile app auth. Expire, can be refreshed. Stored in secure storage (Keychain on iOS, Keystore on Android).
- API keys: used for programmatic access (CI/CD, scripts). Long-lived, no user interaction needed. Not suitable for mobile app auth due to rotation/revocation complexity.
- **Home Assistant model:** Uses long-lived access tokens for API access, user sessions for web/app access.

**OAuth 2.0 + PKCE:**
- Standard for mobile app auth flows. Authorization code flow with PKCE (Proof Key for Code Exchange) prevents authorization code interception on mobile.
- Used by Cloudflare Access when integrating identity providers.
- Tailscale uses OAuth for initial device authentication.

---

## Summary of Landscape

| Surface | Examples | Mobile Pattern | Agent Management? |
|---------|----------|---------------|-------------------|
| Native mobile app | Linear, GitHub Mobile | Best UX, full OS integration | GitHub Mobile manages Copilot agents |
| Responsive web dashboard | Paperclip | Works but limited — no push, no offline, no gestures | Paperclip's primary interface |
| Chat platform (Slack/Teams) | Open SWE, MS Copilot | Leverages existing mobile apps; rich interactive components | Open SWE triggers/monitors via Slack |
| AI companion app | Claude Mobile | Trigger + monitor agents on other machines | Claude Remote Control for Claude Code |
| PWA | (no agent platforms found using this) | Push now works on iOS; offline possible; no voice, limited background | Theoretical option, no observed examples |

| Access Pattern | Examples | Complexity | Best For |
|----------------|----------|-----------|----------|
| Cloud relay | Nabu Casa, Tailscale Funnel | Low (managed) | Single-user, zero-config |
| Mesh VPN | Tailscale, ZeroTier | Low-medium | Small team, all devices in tailnet |
| Reverse proxy + zero-trust | Cloudflare Tunnel + Access | Medium | Public-facing, SSO integration |
| Port forward + HTTPS | Let's Encrypt + nginx | High (self-managed) | Full control, no third-party dependency |
