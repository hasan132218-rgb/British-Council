# IELTS Student Demo Website with Login

This is a student-made IELTS-inspired demo, not an official British Council website.

## Requirements
- Install Node.js 18 or newer from https://nodejs.org/
- Use VS Code to open this folder.

## Run in VS Code terminal
1. Open this folder in VS Code.
2. Choose **Terminal → New Terminal**.
3. Run:
   ```bash
   npm install
   npm start
   ```
4. Open http://localhost:3000 in your browser.

Do not double-click `index.html` for the login system. Open the site through `http://localhost:3000` so the backend works.

## Included features
- Create an account using name, email, and password.
- Log in and log out.
- Passwords are hashed with bcryptjs; plain-text passwords are not saved.
- User profiles persist in `data/users.json`.
- Logged-in users can save demo test reservation requests in the same local data file.
- Session cookies are HTTP-only and have SameSite protection.
- Basic validation and rate limits for login/register routes.

## Where the data is stored
`data/users.json` is created automatically the first time the server runs. It stores account names, emails, password hashes, account creation dates, and demo reservation requests. Keep this file private. Do not upload it to a public repository or share it with your teacher if it contains real personal data. For your presentation, use fictional test details.

## Important limitations
- This is suitable for a local class demo, not a production authentication service.
- The default session secret is only for local development. For deployment, set a strong `SESSION_SECRET` environment variable, use HTTPS, and use a persistent production session store and database.
- Do not use your real/reused password. No real IELTS booking or score is created.
- The demo booking requests are only saved locally and are not sent to the British Council.
