# Setting up PASS

This gets PASS from the repository to a deployed app you can sign in to (the Phase 0 finish line). You need a Supabase account and a Vercel account. Allow about 20 minutes.

## 1. Create the Supabase project

1. In Supabase, click **New project**. Name it `pass`. For **Region**, choose **Sydney (ap-southeast-2)** so drawings stay in Australia. Save the database password somewhere safe.
2. When it's ready, open **SQL Editor** and run these three things in order, each as a new query:
   1. The whole of `supabase/migrations/20260928000000_foundations.sql`. This creates the tables and access rules.
   2. The whole of `supabase/seed.sql`. This creates Forme Studio Tasmania and its four stages.
   3. Your invitation as owner. Put your own email in lower case:
      ```sql
      insert into public.org_invites (org_id, email, role)
      select id, 'you@yourpractice.com.au', 'owner'
      from public.organisations where slug = 'forme-studio';
      ```
3. Open **Project Settings > API Keys** and copy:
   - the **Project URL**
   - the **Publishable key** (older projects call this the `anon` `public` key)

## 2. Deploy on Vercel

1. In Vercel, click **Add New > Project** and import `trish-pick/pass`. It detects Next.js by itself.
2. Before you deploy, open **Environment Variables** and add:
   - `NEXT_PUBLIC_SUPABASE_URL`: the Project URL
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: the Publishable key
3. Click **Deploy**, then copy the address Vercel gives you, e.g. `https://pass-xyz.vercel.app`.

## 3. Point Supabase sign-in at the app

In Supabase, open **Authentication > URL Configuration**:

- **Site URL**: your Vercel address
- **Redirect URLs**: add `https://your-vercel-address/auth/callback`. If you'll also run PASS on your own computer, add `http://localhost:3000/auth/callback` as well.

**Recommended.** This lets a sign-in link requested on one device (your laptop) be opened on another (your phone). Open **Authentication > Emails > Magic Link** and replace the link in the template with:

```html
<a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email">Sign in to PASS</a>
```

## 4. Sign in

Open your Vercel address and enter your email. When you click the link in the email, your invitation is claimed and you land on the **New audit** page. **Projects** shows an empty list.

If you see "You're not part of a practice yet", the invitation email doesn't match the address you signed in with. Check step 1.2.3.

**Email limits.** Supabase's built-in email service only sends a few sign-in emails an hour. Before inviting the team, add your own SMTP under **Authentication > Emails > SMTP Settings**. Your practice email provider or a service like Resend or Postmark will do.

## Adding team members (until the Settings screen exists)

Run the invitation query from step 1.2.3 with their email, and choose a role:

- `owner`: runs everything and manages members
- `reviewer`: edits checklists and the practice profile, and runs audits
- `drafter`: works on projects, audits and findings, but can't change practice settings

## Running PASS on your own computer

```bash
npm install
cp .env.example .env.local   # then fill in the two Supabase values
npm run dev                  # http://localhost:3000
```

Checks before pushing: `npm run lint`, `npm run typecheck`, `npm test`.

With Docker installed, `npx supabase start` runs a complete local Supabase. It uses `supabase/config.toml`, and applies the migration and seed automatically.
