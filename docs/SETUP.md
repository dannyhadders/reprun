# Set up your own RepRun

**TL;DR:** fork the repo → create a database → put two values in `wrangler.jsonc` → connect the
fork to Cloudflare → put a login in front of it → add the app to your phone. About 20 minutes,
all on free plans.

**You need:** a free [Cloudflare](https://dash.cloudflare.com/sign-up) account, a GitHub account,
and a domain whose DNS is on Cloudflare. A spare subdomain such as `gym.yourname.com` is fine.

---

## 1. Fork the repo

On GitHub, click **Fork** on this repo. Your copy is where your settings live, and every push to
it deploys your site.

## 2. Create the database

Cloudflare dashboard → **Storage & databases → D1 SQL database → Create database**.

- Name: `reprun`
- Copy the **Database ID** it shows. You'll need it next.

You don't create any tables yourself. Every deploy brings the database up to date.

## 3. Put your two values in `wrangler.jsonc`

In your fork, edit `wrangler.jsonc` (GitHub's ✎ button works):

| Replace | With |
|---|---|
| `gym.example.com` | the address you want, e.g. `gym.yourname.com` |
| `YOUR_DATABASE_ID` | the ID from step 2 |

Also delete the `"env": { "demo": … }` block at the bottom. It's for the public demo only.

> Rather keep these out of git? Leave the placeholders and add `REPRUN_DOMAIN` and
> `REPRUN_DATABASE_ID` as **build variables** in step 4. The build swaps them in.

## 4. Connect the fork to Cloudflare

Dashboard → **Workers & Pages → Create → Import a repository** → pick your fork.

- Project name: `reprun` (it must match `"name"` in `wrangler.jsonc`)
- Build command: `npm run build`
- Deploy command: `npm run release` (this updates the database tables, then deploys)

Save and let the first build run. **It will fail at the database step.** That's expected: the
build's token can't touch databases yet. Fix it in the next step.

## 5. Let deploys update the database

Cloudflare made an API token for your builds. Give it database access:

Dashboard → your profile (top right) → **API Tokens** → the token named after your Worker build
→ **Edit** → **Add more** → `Account` · `D1` · `Edit` → **Continue → Update token**.

Then **Workers & Pages → reprun → Deployments → Retry build**. It should go green, and your
address starts working within a minute or two. Cloudflare creates the DNS record for you.

## 6. Lock it down (important)

Right now anyone with the address can see and edit your data. Put a login in front of it:

1. Dashboard → **Zero Trust → Access → Applications → Add an application → Self-hosted**.
2. Application domain: your address from step 3. Session duration: **1 month**, so the phone app
   rarely asks you to sign in again.
3. Add a policy: Action **Allow**, Include → **Emails** → your email. The default one-time PIN
   login is fine.
4. Then tell the app who you are, so its API refuses anything that didn't come through that
   login: **Workers & Pages → reprun → Settings → Variables and Secrets → Add** → type
   **Secret**, name `ALLOWED_EMAIL`, value your email → **Deploy**.

Check it: open your address in a private window. You should get Cloudflare's sign-in page.

### 6b. Let the app icons through the login (Optional)

Without this step, adding RepRun to an iPhone home screen gives a blank or screenshot icon. iOS
fetches the icon without your login, so it gets the sign-in page instead of the image. The icon
files are public in this repo anyway, so making them public exposes nothing.

Don't add this to the application from step 6: its rules cover the whole site, and an "everyone"
rule there would open your data. Make a second, smaller application instead. Cloudflare uses the
most specific address, so these four files skip the login and everything else stays locked.

1. **Zero Trust → Access → Applications → Add an application → Self-hosted**.
2. Name: `RepRun icons`.
3. Destinations (**Add public hostname** for each), all with your subdomain and domain from step 3,
   and these paths (no leading `/`):
   `apple-touch-icon.png`, `icon-512.png`, `favicon.svg`, `og.png`
4. Policy: name `Public icons`, Action **Bypass** (no login at all, which is not the same as
   Allow), Include → **Everyone**.
5. Leave everything else at the defaults and **Save**.

Check it:

```sh
curl -I https://gym.yourname.com/apple-touch-icon.png   # want: 200 and content-type: image/png
```

A `302` pointing at `cloudflareaccess.com` means it isn't applied yet. Wait a minute, and check the
paths for typos. Your address in a private window should still ask you to sign in.

## 7. Put it on your phone

**iPhone:** open your address in **Safari**, sign in, then **Share → Add to Home Screen**. It opens
full screen on your dashboard, with no browser bars. The big **+** starts a workout.

**Android:** open it in Chrome, then **⋮ → Add to Home screen**. Long-press the icon for a
**Start workout** shortcut.

No App Store and no developer account needed.

Wrong or old icon? iOS saves the icon when you add the app and never checks again. Long-press it
→ **Remove App** → **Delete Bookmark**, then add it again from Safari. This only removes the
shortcut, not your data. Don't clear Safari's website data to fix it: that also deletes workouts
still waiting to upload.

## 8. Optional: Strava

1. Create an app at <https://www.strava.com/settings/api>, with **Authorization Callback Domain**
   set to your address (no `https://`).
2. **Workers & Pages → reprun → Settings → Variables and Secrets**, and add two secrets:
   `STRAVA_CLIENT_ID` and `STRAVA_CLIENT_SECRET`, from the Strava app page.
3. In RepRun: **Settings → Strava → Connect**, then **Sync now**.

---

## Link previews (optional)

`index.html` points its preview image at the public demo. If you'll share links to your own copy,
change `og:image` to `https://<your address>/og.png`. Most copies sit behind a login, though, and
then link previews show the Cloudflare sign-in page whatever you set.

## Keeping up to date

On your fork's GitHub page, click **Sync fork**. That push deploys, and any new database changes
are applied as part of it. Your data is never touched by updates.

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
   step 5.
3. Don't add an Access login. The demo is meant to be public.
