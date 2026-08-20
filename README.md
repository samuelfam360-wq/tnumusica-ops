# Play Studio Manager — setup and deploy

You already have GitHub, Supabase, and Vercel accounts. Here's the rest, step by step.

## 1. Set up the database

1. Go to your Supabase project → **SQL Editor** → **New query**.
2. Open `supabase/schema.sql` in this folder, copy all of it, paste it into the SQL editor, click **Run**.
   This creates all the tables (teachers, students, lessons, blocked_dates, profiles) and the security
   rules that keep teachers from seeing each other's data.

## 2. Create your own admin login

1. In Supabase, go to **Authentication → Users → Add user**. Enter your own email and a password. Create it.
2. Copy the **User UID** shown next to your new user.
3. Go to **Table Editor → profiles → Insert row**. Set `id` to the UID you copied, `role` to `admin`. Save.

This is the only manual database step you'll ever need — every teacher after this gets linked
through the app itself (Teachers tab → Link login).

## 3. Get your Supabase keys

Go to **Settings → API**. You'll need two values in a moment:
- **Project URL**
- **anon public** key

## 4. Push this project to GitHub

Open a terminal in this project folder and run:

```
git init
git add .
git commit -m "Play Studio Manager"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/playstudio-manager.git
git push -u origin main
```

(Create the empty repo first at github.com/new, name it `playstudio-manager`, then run the commands above.)

## 5. Deploy on Vercel

1. Go to vercel.com → **Add New Project** → pick the `playstudio-manager` repo.
2. Before clicking deploy, open **Environment Variables** and add:
   - `NEXT_PUBLIC_SUPABASE_URL` = your Project URL from step 3
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = your anon public key from step 3
3. Click **Deploy**.

You'll get a live link like `playstudio-manager.vercel.app`. Log in with the admin account you made in step 2.

## 6. Add a teacher

1. In the app (as admin) → **Teachers** tab → **Add teacher** (name, pay rate).
2. In Supabase → **Authentication → Add user**, create that teacher's email + password. Copy their User UID.
3. Back in the app → on that teacher's card → **Link login** → paste the UID.

The teacher can now sign in at the same link and only ever sees their own lessons, pay, and blocked dates.

## What's built in

- Shared calendar, teacher assignment, add/edit teachers and students
- Payment calculation (flat rate or percentage), pending vs paid tracking
- Printable invoices per student
- Replacement tracking (owed to student vs no-fault missed lesson)
- Teacher portal: mark attendance, block unavailable dates, see own pending/paid payment

## What to add next (as you use it)

Nothing is wired up beyond the above yet — bring anything that comes up while using it and I'll build it in.
