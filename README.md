<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1zx6Y3U26cJm-7_gC4a7VJ6g0NR5Hr7aR

## Run Locally

**Prerequisites:**  Node.js

1. Install dependencies:
   `npm install`
2. Set the Gemini API key (optional, for AI summary):
   - Create `.env.local` and add `VITE_GEMINI_API_KEY=your_api_key` (Vite exposes only `VITE_*` to the client).
   - Or `GEMINI_API_KEY` for Node/SSR environments.
3. Run the app:
   `npm run dev`

## Security (OWASP Secure Coding)

This project applies OWASP secure coding practices where applicable:

- **Input validation:** All user inputs (reason, manager comment, holiday name, dates) are validated and length-limited before persist.
- **Session:** Passwords are not stored in session storage; only non-sensitive user fields are kept and the full user is resolved from the user list.
- **Access control:** Notification "mark as read" and leave approval require the current user's ID; managers can only act on their subordinates' requests in the UI.
- **Safe parsing:** All `localStorage` reads use safe JSON parse with fallbacks to avoid crashes from tampered data.
- **Login:** Client-side rate limiting after failed attempts; no password displayed in the demo panel.
- **API:** Gemini service sanitizes data sent to the API and does not log error details.
- **Production:** Use server-side authentication and hashed passwords; do not expose API keys in client bundles.
