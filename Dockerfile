FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Disable telemetry during the build
ENV NEXT_TELEMETRY_DISABLED=1

# These ARGs are passed at build time from Railway
# Default values are used only for build time, not runtime
ARG NEXT_PUBLIC_SUPABASE_URL=https://placeholder-build-time-only.supabase.co
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder-build-time-only
ARG NEXT_PUBLIC_SITE_URL=https://placeholder-build-time-only.app

# Pass the build ARGs to environment variables
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL

RUN echo "Building with Supabase URL: $NEXT_PUBLIC_SUPABASE_URL (build-time value only)"
RUN echo "Building with Site URL: $NEXT_PUBLIC_SITE_URL (build-time value only)"
RUN npm run build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# These will be overridden at container runtime
ENV NEXT_PUBLIC_SUPABASE_URL=
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=
ENV NEXT_PUBLIC_SITE_URL=

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public

# Set the correct permission for prerender cache
RUN mkdir .next
RUN chown nextjs:nodejs .next

# Automatically leverage output traces to reduce image size
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000
ENV PORT=3000

# Create a health check script
# RUN echo '#!/bin/sh\necho "Health check passed"\nexit 0' > /app/healthcheck.sh && \
#     chmod +x /app/healthcheck.sh

# Use a shell script to check for environment variables at runtime
CMD ["sh", "-c", "if [ -z \"$NEXT_PUBLIC_SUPABASE_URL\" ] || [ -z \"$NEXT_PUBLIC_SUPABASE_ANON_KEY\" ] || [ -z \"$NEXT_PUBLIC_SITE_URL\" ]; then echo \"❌ Error: Required environment variables missing. Please set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, and NEXT_PUBLIC_SITE_URL in your Railway project\"; exit 1; else echo \"✅ Starting server with environment: $NODE_ENV\"; node server.js; fi"]