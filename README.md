# Instagram Checker — By Yasmin Almeida

A mobile-first sequential Instagram status checker added alongside the original Coin Elite balance, session, payment-card export, settings, and WhatsApp submission tools.

## Features

- Up to 150 Instagram usernames
- Checks one username at a time
- Green LIVE and red DEAD/OFFLINE counters
- Start, pause, resume, stop, and recheck actions
- Saved username list and results in the browser
- Mobile-style PIN lock with a trusted-browser cookie
- Existing Coin Elite features preserved

## Vercel environment variables

Set these in **Project Settings → Environment Variables**:

- `APP_PIN`: a 4–6 digit PIN. The development fallback is `2580`; change it before sharing the app.
- `AUTH_SECRET`: a long random secret used to sign remembered-browser sessions.
- `INSTAGRAM_SESSIONID` (optional): an Instagram web session ID. This can improve profile visibility, but it may expire or trigger verification. Never commit it to the repository.

## Important limitation

Instagram does not provide a general official endpoint for checking arbitrary public usernames for live status. The serverless checker uses Instagram's web response and therefore may return `LOGIN NEEDED`, `RATE LIMIT`, or `UNKNOWN`. Those results are not counted as offline.
