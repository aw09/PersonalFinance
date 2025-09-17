'use client'

import { Auth } from '@supabase/auth-ui-react'
import { ThemeSupa } from '@supabase/auth-ui-shared'
import { supabase } from '@/lib/supabase'
import { useTheme } from '@/contexts/ThemeContext'

export default function AuthComponent() {
  const { theme } = useTheme()

  return (
    <div className="card max-w-md mx-auto">
      <div className="card-body">
        <Auth
          supabaseClient={supabase}
          appearance={{ 
            theme: ThemeSupa,
            variables: {
              default: {
                colors: {
                  brand: theme === 'dark' ? '#60a5fa' : '#3b82f6',
                  brandAccent: theme === 'dark' ? '#3b82f6' : '#2563eb',
                  inputBackground: 'transparent',
                  inputBorder: theme === 'dark' ? 'rgb(55, 65, 81)' : 'rgb(209, 213, 219)',
                  inputBorderFocus: theme === 'dark' ? '#60a5fa' : '#3b82f6',
                  inputBorderHover: theme === 'dark' ? 'rgb(75, 85, 99)' : 'rgb(156, 163, 175)',
                  inputText: theme === 'dark' ? 'rgb(243, 244, 246)' : 'rgb(17, 24, 39)',
                  inputLabelText: theme === 'dark' ? 'rgb(209, 213, 219)' : 'rgb(55, 65, 81)',
                  inputPlaceholder: theme === 'dark' ? 'rgb(156, 163, 175)' : 'rgb(156, 163, 175)',
                  messageText: theme === 'dark' ? 'rgb(243, 244, 246)' : 'rgb(17, 24, 39)',
                  messageTextDanger: theme === 'dark' ? '#f87171' : '#ef4444',
                  messageTextSuccess: theme === 'dark' ? '#34d399' : '#10b981',
                  anchorTextColor: theme === 'dark' ? '#60a5fa' : '#3b82f6',
                  anchorTextHoverColor: theme === 'dark' ? '#3b82f6' : '#2563eb',
                  // Fix message background visibility
                  messageBackground: theme === 'dark' ? 'rgba(31, 41, 55, 0.8)' : 'rgba(249, 250, 251, 0.9)',
                  messageBorder: theme === 'dark' ? 'rgb(55, 65, 81)' : 'rgb(209, 213, 219)',
                },
                space: {
                  inputPadding: '12px 16px',
                  buttonPadding: '12px 24px',
                },
                borderWidths: {
                  buttonBorderWidth: '1px',
                  inputBorderWidth: '1px',
                  messageBorderWidth: '1px',
                },
                radii: {
                  borderRadiusButton: '12px',
                  buttonBorderRadius: '12px',
                  inputBorderRadius: '12px',
                  messageBorderRadius: '8px',
                },
              },
            },
            className: {
              anchor: 'transition-colors duration-200',
              button: 'transition-all duration-200 font-medium shadow-soft hover:shadow-soft-lg',
              input: 'transition-all duration-200',
              label: 'font-medium',
              message: 'text-sm p-3 mb-4 border rounded-lg',
            }
          }}
          providers={[]}
          redirectTo={`${process.env.NEXT_PUBLIC_SITE_URL || window.location.origin}/auth/callback`}
        />
      </div>
    </div>
  )
}