
## Two ways the Turso credentials get pasted wrong

1. **A Markdown-mangled URL.** Pasting the URL from a chat or doc that rendered it as a link
   produces `libsql://[host.turso.io](http://host.turso.io)` — square brackets and a
   parenthesised `http://` copy glued onto the value. The connection then fails with no useful
   message. The value must be exactly `libsql://<host>.turso.io`, nothing else. Check it in
   Vercel → Settings → Environment Variables by eye before redeploying.

2. **A token that has been in a chat, screenshot or issue is a leaked token.** Paste it nowhere;
   invalidate it in the Turso dashboard and issue a new one, then put the new one only into the
   platform's environment-variable store. Nothing in this repository may ever contain it: the app
   reads `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` from the environment at boot and prints neither.

How to tell the two failure modes apart after redeploying:
  · the deployment **crashes at boot** (`Startup failed: fetch failed`) → the URL or token is wrong
    or the database is not reachable from Vercel;
  · the deployment **serves** but `GET /api/health` shows `"persistent": false` → the environment
    variables did not reach the function (wrong project, or set after the deploy without
    redeploying);
  · `"persistent": true` and `"demo_data": false` → configured correctly.
