# Setting up RepRun: instructions for an AI coding agent

You're helping a person host their own RepRun on Cloudflare's free plan, at a
`<name>.<subdomain>.workers.dev` address behind a Cloudflare Access login. Most of it is one
command, `npm run setup`. A few steps happen in their browser and only they can do them: say so
clearly, wait for them, and check the result.

Keep your messages short and plain. The person may not be technical.

## Never

- Print, log, commit or repeat back secrets: the AUD tag and anything they paste for a secret.
  The email is fine to repeat.
- Edit `wrangler.jsonc` or commit anything. Setup doesn't need either.
- Run `npm run deploy`, `npm run release` or a bare `npx wrangler deploy`. Use `npm run setup` only.
- Pass `--update <name>` unless the person has said they want to update that Worker.
- Work around the script's refusal to touch an existing Worker. Pick a different `--name` instead.

## Steps

1. **Check the basics:** `node --version` must be 20 or later. If the repo isn't cloned yet, run
   `git clone https://github.com/dannyhadders/reprun && cd reprun`. Then run `npm install`.

2. **Ask the person** for:
   - the email they log in to Cloudflare with (the login only lets in Cloudflare account members)
   - a name for their copy. `reprun` is fine unless they already have something called that on
     Cloudflare.

   Don't make these up.

3. **Cloudflare login:** run `npx wrangler whoami`. If it says they're not logged in, ask the
   person to run `npx wrangler login` themselves (in your tool, `! npx wrangler login`). It opens
   their browser. Wait for them to confirm, then run `whoami` again.

4. **Run setup:**

   ```sh
   npm run setup -- --email THEIR_EMAIL --name THEIR_NAME
   ```

   It creates the database, builds, deploys and sets `ALLOWED_EMAIL`, then prints the address and
   the login steps. Without a terminal it skips its questions.
   - If it stops because a Worker of that name already exists and wasn't made by setup, ask for
     another name and run it again.
   - If it says the Worker was made by setup before, it only carries on with `--update NAME`. Use
     that only if the person confirms it's their earlier copy.
   - If it says a **database** of that name exists but there's no Worker, `--update NAME` would use
     that database and whatever is in it. Only do that if the person confirms an earlier setup run
     stopped part-way. Otherwise pick a different name.
   - First deploy on a new Cloudflare account: deploy fails and asks for a workers.dev subdomain,
     with a link. The person opens the link and picks one, then you run the same command again.
   - The address isn't in a fixed place in the output: look for the `https://….workers.dev` line
     wrangler prints after deploying.

5. **Check it's up and locked:**

   ```sh
   curl -s https://ADDRESS/api/data
   ```

   Expect `{"error":"Almost there: …"}`. That means it's deployed and refusing everyone until the
   login is on, which is correct.

6. **The person turns on the login** in the Cloudflare dashboard. Give them these steps:
   1. **Workers & Pages → NAME** → the **Access** tab → **Protect this Worker behind Access** →
      **All traffic**.
   2. Authentication policy: **Cloudflare account**. Session duration: **7 days** (the longest
      there). **Apply**.
   3. Under **Application values** on the right, copy the **AUD** tag and the **JWKS** link, and
      paste both to you. The JWKS link works as the team: the script keeps just the team part.

7. **Add the two values** once they've pasted them to you:

   ```sh
   npm run setup -- --email THEIR_EMAIL --name THEIR_NAME --update THEIR_NAME --team TEAM --aud AUD
   ```

   This is the re-run path: it redeploys the same copy, keeps the data and sets both secrets.

8. **Check the login works:** `curl -sI https://ADDRESS` should return `302` with a `location`
   on `cloudflareaccess.com`. Then ask the person to open the address in a private window, sign
   in, and see their (empty) dashboard.

9. **Phone:** tell them to open the address in Safari (iPhone) or Chrome (Android), sign in, and
   use **Share → Add to Home Screen** (or **⋮ → Add to Home screen**).

## Afterwards

- **Updates:** `git pull`, then step 7 again (without `--team`/`--aud`, to keep the existing ones).
- **Strava (optional):** see "Optional: Strava" in `docs/SETUP.md`.
- **Something failed:** the script prints wrangler's error. Read it, fix the cause, and run the
  same command again. It's safe to re-run.
