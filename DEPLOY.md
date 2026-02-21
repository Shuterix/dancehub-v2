# Deploying DanceHub to Vercel

## 1. Vercel project

- Push your code to GitHub (or GitLab/Bitbucket).
- Go to [vercel.com/new](https://vercel.com/new) and import the repo.
- Leave **Framework Preset** as Next.js and **Root Directory** as `.` (unless you use a monorepo).

---

## 2. Environment variables (Vercel)

In the Vercel project: **Settings → Environment Variables**. Add:

| Name | Value | Notes |
|------|--------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL | From Supabase Dashboard → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase **anon** / public key | Same place; safe to expose in the browser |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase **service_role** key | Same place; **never** expose to the client. Used for register + external-teacher sign-in. |
| `NEXT_PUBLIC_CLARITY_PROJECT_ID` | (Optional) Microsoft Clarity project ID | For session recordings and heatmaps. Get it at [clarity.microsoft.com](https://clarity.microsoft.com). If unset, Clarity is not loaded. |

Add them for **Production** (and optionally Preview if you want). Redeploy after changing env vars.

---

## 3. Supabase redirect URLs

In **Supabase Dashboard → Authentication → URL Configuration**:

1. **Site URL**  
   Set to your production URL, e.g. `https://your-app.vercel.app`.

2. **Redirect URLs**  
   Add every URL where Supabase should redirect after auth (one per line). At minimum:

   - `https://your-app.vercel.app/auth/callback`  
     (Google OAuth and similar)
   - `https://your-app.vercel.app/auth/reset-password`  
     (password reset link from email)

   If you add a **custom domain** later (e.g. `https://app.dancehub.com`), add:

   - `https://app.dancehub.com/auth/callback`
   - `https://app.dancehub.com/auth/reset-password`

   and set **Site URL** to that domain when you switch.

---

## 4. Build and deploy

- **Build Command:** `next build` (Vercel default).
- **Output Directory:** leave default (Vercel detects Next.js).
- Your `package.json` has `"build": "next build"`; no change needed.

Trigger a deploy (e.g. **Deployments → Redeploy** or push to the connected branch). First deploy can take a couple of minutes.

---

## 5. After deploy

- Open your production URL and try:
  - Sign up / sign in (email and Google if configured).
  - Password reset (forgot password → email link → reset page).
- If something fails, check:
  - **Vercel → Project → Logs** (runtime and build).
  - **Supabase → Authentication → Logs** (auth errors).
  - That redirect URLs in Supabase exactly match your live URL (no trailing slash, correct protocol and path).

---

## 6. Optional: custom domain

- In Vercel: **Settings → Domains** → add your domain and follow DNS instructions.
- In Supabase: add the new domain’s callback and reset-password URLs to **Redirect URLs** and, if you use it as the main app URL, set **Site URL** to that domain.

---

## Quick checklist

- [ ] Repo connected to Vercel
- [ ] `NEXT_PUBLIC_SUPABASE_URL` set in Vercel
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY` set in Vercel
- [ ] `SUPABASE_SERVICE_ROLE_KEY` set in Vercel
- [ ] Supabase **Site URL** = production URL
- [ ] Supabase **Redirect URLs** include `/auth/callback` and `/auth/reset-password` for that URL
- [ ] Deploy triggered and build succeeded
- [ ] Login and password reset tested in production
