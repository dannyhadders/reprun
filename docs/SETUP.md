# Set up your own RepRun

**TL;DR:** click the button → put a login in front of it → add the app to your phone. About 10
minutes, all on free plans, and no domain needed.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/dannyhadders/reprun)

**You need:** a free [Cloudflare](https://dash.cloudflare.com/sign-up) account and a GitHub account.

Got a domain and want RepRun on it, e.g. `gym.yourname.com`? Use [Own domain](#own-domain) instead.

---

## 1. Click the button

Click **Deploy to Cloudflare** above and sign in to Cloudflare and GitHub. Cloudflare copies RepRun
into your GitHub, creates the database, and deploys it. Every push to your copy deploys again.

When it asks for values:

- `ALLOWED_EMAIL`: the email you'll sign in with. The app refuses everyone else.
- Leave the rest empty. You'll fill in the `ACCESS_…` ones in step 2. Strava is optional (step 5).

When it's done you get an address like `reprun.yourname.workers.dev`. Opening it now says
"Almost there: turn on Cloudflare Access". That's expected: it stays locked until step 2.

> Build failed at the database step (`wrangler d1 migrations`)? The build's token needs database
> access. See [Let deploys update the database](#let-deploys-update-the-database), then retry the
> build.

## 2. Put a login in front of it

1. Dashboard → **Workers & Pages → reprun → Settings → Domains & Routes**. On the `workers.dev`
   row, turn on **Cloudflare Access**.
2. It shows two values. Copy them:
   - the **Audience (AUD) tag**, a long string of letters and numbers
   - your **team name**, the part before `.cloudflareaccess.com` in the URL it shows
3. Same Settings page → **Variables and Secrets → Add**, type **Secret**, twice:
   `ACCESS_AUD` = the Audience tag, `ACCESS_TEAM` = the team name. Then **Deploy**.
4. Dashboard → **Zero Trust → Access → Applications** → the new reprun application → check its
   policy lets in your email (Include → **Emails**). Set **Session duration** to **1 month** so the
   phone app rarely asks you to sign in again.

Check it: open your address in a private window. You should get Cloudflare's sign-in page, then
your (empty) dashboard.

Why both a login and the secrets? Access does the sign-in. The secrets let the app check Access's
signed pass itself, so nobody can get in by pretending to be you.

## 3. Put it on your phone

**iPhone:** open your address in **Safari**, sign in, then **Share → Add to Home Screen**. It opens
full screen on your dashboard, with no browser bars. The big **+** starts a workout.

**Android:** open it in Chrome, then **⋮ → Add to Home screen**. Long-press the icon for a
**Start workout** shortcut.

No App Store and no developer account needed.

Wrong or old icon? iOS saves the icon when you add the app and never checks again. Long-press it
→ **Remove App** → **Delete Bookmark**, then add it again from Safari. This only removes the
shortcut, not your data. Don't clear Safari's website data to fix it: that also deletes workouts
still waiting to upload. A blank or screenshot icon means iOS couldn't fetch it through the login:
see [Let the app icons through the login](#let-the-app-icons-through-the-login-optional).

## 4. That's it

Log a workout, or paste a plan from your PT: **+ → Import plan**.

## 5. Optional: Strava

1. Create an app at <https://www.strava.com/settings/api>, with **Authorization Callback Domain**
   set to your address (no `https://`).
2. **Workers & Pages → reprun → Settings → Variables and Secrets**, and add two secrets:
   `STRAVA_CLIENT_ID` and `STRAVA_CLIENT_SECRET`, from the Strava app page.
3. In RepRun: **Settings → Strava → Connect**, then **Sync now**.

---

## Own domain

Same app on an address like `gym.yourname.com`. You need a domain whose DNS is on Cloudflare.

1. **Fork** this repo on GitHub.
2. **Create the database:** dashboard → **Storage & databases → D1 SQL database → Create
   database**, name `reprun`. Copy the **Database ID**.
3. **Connect the fork:** **Workers & Pages → Create → Import a repository** → pick your fork.
   - Project name: `reprun`
   - Build command: `npm run build`
   - Deploy command: `npm run release` (updates the database tables, then deploys)
   - **Build variables:** `REPRUN_DOMAIN` = your address, `REPRUN_DATABASE_ID` = the ID from step 2.
     The build swaps them into `wrangler.jsonc`, so they stay out of git.

   The first build fails at the database step. That's expected; the next step fixes it.
4. [Let deploys update the database](#let-deploys-update-the-database), then **Deployments →
   Retry build**. Your address works within a minute or two. Cloudflare creates the DNS record.
5. **Login:** **Zero Trust → Access → Applications → Add an application → Self-hosted**.
   Application domain: your address. Session duration: **1 month**. Policy: Action **Allow**,
   Include → **Emails** → your email.
6. **Secrets:** **Workers & Pages → reprun → Settings → Variables and Secrets → Add**, type
   **Secret**: `ALLOWED_EMAIL` = your email. Optionally also `ACCESS_AUD` (the application's
   Audience tag, under its **Overview**) and `ACCESS_TEAM` (your team name, under **Zero Trust →
   Settings**) so the app checks Access's signed pass too.
7. Check it in a private window: you should get Cloudflare's sign-in page. Then [put it on your
   phone](#3-put-it-on-your-phone).

### Let the app icons through the login (optional)

Without this, adding RepRun to an iPhone home screen can give a blank or screenshot icon. iOS
fetches the icon without your login, so it gets the sign-in page instead of the image. The icon
files are public in this repo anyway, so making them public exposes nothing.

Don't add this to your main login application: its rules cover the whole site, and an "everyone"
rule there would open your data. Make a second, smaller application instead. Cloudflare uses the
most specific address, so these four files skip the login and everything else stays locked.

1. **Zero Trust → Access → Applications → Add an application → Self-hosted**.
2. Name: `RepRun icons`.
3. Destinations (**Add public hostname** for each), all with your address, and these paths (no
   leading `/`): `apple-touch-icon.png`, `icon-512.png`, `favicon.svg`, `og.jpg`
4. Policy: name `Public icons`, Action **Bypass** (no login at all, which is not the same as
   Allow), Include → **Everyone**.
5. Leave everything else at the defaults and **Save**.

Check it:

```sh
curl -I https://gym.yourname.com/apple-touch-icon.png   # want: 200 and content-type: image/png
```

A `302` pointing at `cloudflareaccess.com` means it isn't applied yet. Wait a minute, and check the
paths for typos. Your address in a private window should still ask you to sign in.

### Let deploys update the database

Cloudflare made an API token for your builds. Give it database access:

Dashboard → your profile (top right) → **API Tokens** → the token named after your Worker build
→ **Edit** → **Add more** → `Account` · `D1` · `Edit` → **Continue → Update token**.

---

## Link previews (optional)

`index.html` points its preview image at the public demo. If you'll share links to your own copy,
change `og:image` to `https://<your address>/og.jpg`. Most copies sit behind a login, though, and
then link previews show the Cloudflare sign-in page whatever you set.

## Keeping up to date

- **Forked (own domain):** on your fork's GitHub page, click **Sync fork**.
- **Made with the button:** your copy isn't a fork, so there's no Sync button. In a terminal:
  `git pull --allow-unrelated-histories https://github.com/dannyhadders/reprun main && git push`.

Either way the push deploys, and any new database changes are applied as part of it. Your data is
never touched by updates.

## Backups

D1 keeps 30 days of history. To roll back: **Storage & databases → D1 → reprun → Time Travel**.
For your own copy: `npx wrangler d1 export reprun --remote --output backup.sql`.

## Costs

Everything here fits Cloudflare's free tiers: Workers 100k requests a day, D1 5 GB, and Access up
to 50 users. One person logging workouts uses a tiny fraction of that.

## Running a public demo too (optional)

The `env.demo` block in `wrangler.jsonc` is how the public demo runs. It's a second Worker with
its own database, no login, made-up data, and a nightly wipe. Your real data is never connected to
it. To run your own:

1. Create a second database (`reprun-demo`) and put its ID and a domain in the `demo` block.
2. Import the same repo as a second Worker named `reprun-demo`. Use build command
   `npm run build:demo` and deploy command `npm run release`, then give its token D1 access as in
   [Let deploys update the database](#let-deploys-update-the-database).
3. Don't add an Access login. The demo is meant to be public.
