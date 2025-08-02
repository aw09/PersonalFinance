import { Html, Head, Main, NextScript } from 'next/document'

export default function Document() {
  return (
    <Html lang="en">
      <Head />
      <body>
        {/* Inject environment variables at runtime */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              window.__env = window.__env || {};
              window.__env.NEXT_PUBLIC_SUPABASE_URL = "${process.env.NEXT_PUBLIC_SUPABASE_URL || ''}";
              window.__env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''}";
            `,
          }}
        />
        <Main />
        <NextScript />
      </body>
    </Html>
  )
}
