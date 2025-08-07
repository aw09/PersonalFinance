export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string
          full_name: string | null
          avatar_url: string | null
          telegram_user_id: number | null
          telegram_chat_id: number | null
          telegram_username: string | null
          telegram_linked_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          full_name?: string | null
          avatar_url?: string | null
          telegram_user_id?: number | null
          telegram_chat_id?: number | null
          telegram_username?: string | null
          telegram_linked_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          full_name?: string | null
          avatar_url?: string | null
          telegram_user_id?: number | null
          telegram_chat_id?: number | null
          telegram_username?: string | null
          telegram_linked_at?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      wallets: {
        Row: {
          id: string
          name: string
          description: string | null
          currency: string
          balance: number
          owner_id: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          description?: string | null
          currency?: string
          balance?: number
          owner_id: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          description?: string | null
          currency?: string
          balance?: number
          owner_id?: string
          created_at?: string
          updated_at?: string
        }
      }
      categories: {
        Row: {
          id: string
          name: string
          color: string
          icon: string | null
          type: 'income' | 'expense'
          user_id: string
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          color?: string
          icon?: string | null
          type: 'income' | 'expense'
          user_id: string
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          color?: string
          icon?: string | null
          type?: 'income' | 'expense'
          user_id?: string
          created_at?: string
        }
      }
      transactions: {
        Row: {
          id: string
          amount: number
          description: string
          date: string
          type: 'income' | 'expense' | 'transfer'
          category_id: string | null
          wallet_id: string
          user_id: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          amount: number
          description: string
          date?: string
          type: 'income' | 'expense' | 'transfer'
          category_id?: string | null
          wallet_id: string
          user_id: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          amount?: number
          description?: string
          date?: string
          type?: 'income' | 'expense' | 'transfer'
          category_id?: string | null
          wallet_id?: string
          user_id?: string
          created_at?: string
          updated_at?: string
        }
      }
      telegram_sessions: {
        Row: {
          id: string
          telegram_user_id: number
          telegram_chat_id: number
          session_data: any
          current_step: string | null
          expires_at: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          telegram_user_id: number
          telegram_chat_id: number
          session_data?: any
          current_step?: string | null
          expires_at?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          telegram_user_id?: number
          telegram_chat_id?: number
          session_data?: any
          current_step?: string | null
          expires_at?: string
          created_at?: string
          updated_at?: string
        }
      }
      telegram_link_tokens: {
        Row: {
          id: string
          user_id: string
          token: string
          telegram_user_id: number | null
          expires_at: string
          used_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          token: string
          telegram_user_id?: number | null
          expires_at?: string
          used_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          token?: string
          telegram_user_id?: number | null
          expires_at?: string
          used_at?: string | null
          created_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cleanup_expired_telegram_data: {
        Args: {}
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
  }
}