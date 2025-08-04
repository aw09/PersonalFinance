# Authentication Configuration

## Overview

This application uses Supabase Auth for user authentication, including email confirmation, password reset, and user sign-up/sign-in flows.

## Configuration for Production

### The Localhost Redirect Issue

If confirmation emails are redirecting to `http://localhost:3000` in production, this is because the Supabase Site URL is not configured properly for your production environment.

### Solution Steps

#### 1. Configure Supabase Dashboard Settings

1. Go to your Supabase project dashboard
2. Navigate to **Authentication > URL Configuration**
3. Update the following settings:
   - **Site URL**: Set to your production domain (e.g., `https://your-app.railway.app`)
   - **Redirect URLs**: Add your production domain patterns:
     - `https://your-app.railway.app/**`
     - `https://your-app.railway.app/auth/callback`

#### 2. Set Environment Variables

In your production environment, set:

```env
NEXT_PUBLIC_SITE_URL=https://your-production-domain.com
```

This environment variable is used by the authentication component to construct redirect URLs.

#### 3. Verify Configuration

After updating the Supabase settings:

1. Deploy your application with the new environment variable
2. Test user registration - check that confirmation emails contain the correct production URL
3. Test password reset - verify links redirect to your production domain

## Development vs Production

### Local Development

- Site URL in `supabase/config.toml`: `http://127.0.0.1:3000`
- Environment variable: `NEXT_PUBLIC_SITE_URL=http://localhost:3000`
- Supabase local instance handles email redirects

### Production

- Site URL in Supabase dashboard: `https://your-domain.com`
- Environment variable: `NEXT_PUBLIC_SITE_URL=https://your-domain.com`
- Production Supabase instance uses dashboard configuration

## Troubleshooting

### Emails Still Redirect to Localhost

1. **Check Supabase Dashboard**: Ensure Site URL is set to production domain
2. **Check Environment Variables**: Verify `NEXT_PUBLIC_SITE_URL` is set correctly
3. **Clear Browser Cache**: Old cached tokens might have old redirect URLs
4. **Restart Application**: Ensure new environment variables are loaded

### Redirect URLs Not Working

1. **Wildcard Patterns**: Use `https://your-domain.com/**` in Supabase redirect URLs
2. **Exact Matches**: Also add specific paths like `/auth/callback`
3. **Protocol Matching**: Ensure HTTPS vs HTTP matches your deployment

## Implementation Details

The authentication flow works as follows:

1. User enters email on sign-up/password reset form
2. Supabase sends email with link containing the configured Site URL
3. User clicks link, which redirects to the callback URL
4. The `/auth/callback` route processes the authentication code
5. User is redirected to the dashboard on success

The `redirectTo` parameter in the Auth component is constructed using:
- `NEXT_PUBLIC_SITE_URL` environment variable (if set)
- `window.location.origin` (fallback for development)

This ensures the authentication flow works correctly in both development and production environments.