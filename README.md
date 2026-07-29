# T'numusica Operations — Web App

Calendar, students, rate table, income, and invoices for the studio — with
email-restricted login so only people you approve can access it.

## What you need (all free tier, for this size of use)

1. A **Supabase** account — this is your database + login system.
2. A **Vercel** account — this hosts the website.
3. A **GitHub** account — Vercel deploys from a GitHub repo.
4. (Optional, for the "Tell it what to do" AI bar) An **Anthropic API key**
   from console.anthropic.com. This is billed separately, per use — small
   amounts for this kind of use, but it's a real cost, not free. Skip it and
   the rest of the app still works fine; the AI bar just won't respond.

---

## 1. Set up Supabase

1. Go to supabase.com → New project. Pick any name/region, set a database
   password (save it somewhere).
2. Once it's created, go to **SQL Editor** → New query.
3. Open `supabase/schema.sql` from this project, copy all of it, paste it
   in, and click **Run**.
4. Before running, edit the line near the top that says
   `'YOUR_EMAIL_HERE@example.com'` — put your own real email there first,
   so you're not locked out. (You can add more people afterward, see step 5.)
5. To add more people later: **Table Editor** → `allowed_users` → Insert row
   → paste their email → Save. To remove someone, delete their row.
6. Go to **Project Settings → API**. You'll need two values from here in a
   moment: **Project URL** and the **anon public** key.
7. Go to **Authentication → Providers → Email** and make sure Email is
   enabled (it is by default). This project uses passwordless "magic link"
   sign-in, so no extra setup needed there.

## 2. Push this project to GitHub

1. Create a new empty repository on GitHub (e.g. `tnumusica-ops`).
2. From this project folder:
   ```
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin <your-repo-url>
   git push -u origin main
   ```

## 3. Deploy on Vercel

1. Go to vercel.com → Add New → Project → import the GitHub repo you just
   pushed.
2. Before deploying, open **Environment Variables** and add:
   - `NEXT_PUBLIC_SUPABASE_URL` — the Project URL from Supabase step 1.6
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` — the anon public key from the same
     place
   - `ANTHROPIC_API_KEY` — only if you want the AI command bar working
3. Click **Deploy**. After a minute or two you'll get a live URL like
   `tnumusica-ops.vercel.app`.

## 4. Try it

1. Open the URL. Enter your email → you'll get a magic link in your inbox
   → click it → you're in.
2. Set up your grade codes on the **Rates** tab first, then add students,
   book lessons, and generate invoices.
3. Anyone else's email you added to `allowed_users` can sign in the same
   way, from their own device.

## Notes

- **Adding/removing access later**: edit the `allowed_users` table in
  Supabase's Table Editor directly — no redeploy needed, takes effect
  immediately.
- **Your own domain**: in Vercel, Project → Settings → Domains, you can
  point a domain you own (e.g. `ops.tnumusica.com`) at this instead of the
  `.vercel.app` address.
- **Local development**: copy `.env.local.example` to `.env.local`, fill in
  the same three values, then `npm install && npm run dev`.
- **Cost**: Supabase and Vercel free tiers comfortably cover a single small
  studio's worth of traffic and data. The only ongoing cost is the
  Anthropic API key, if you use the AI command bar, and that's pay-per-use
  and typically small for this volume.
