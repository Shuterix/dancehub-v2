# Confirmation email setup (Supabase)

For signup confirmation emails to be sent:

1. **Supabase Dashboard** → **Authentication** → **Providers** → **Email**
   - Turn **ON** “Confirm email”.
   - Save.

2. **Authentication** → **Email Templates** → **Confirm signup**
   - Paste the contents of `confirm-signup.html` into the template body (or the HTML field).
   - Save.

3. **(Optional)** **Project Settings** → **Auth** → **SMTP**
   - By default Supabase sends via its own servers (with limits).
   - For production you can set custom SMTP so your domain sends the emails.

After this, when users register (client-side signup), Supabase will send the confirmation email and they must click the link before signing in.
