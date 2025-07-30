export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string
          full_name: string | null
          avatar_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          full_name?: string | null
          avatar_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          full_name?: string | null
          avatar_url?: string | null
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
  }
}