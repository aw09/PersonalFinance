import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

/**
 * Migration utility for managing database schema changes
 * This utility provides functions to run migrations manually if needed
 */
export class MigrationManager {
  private supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })

  /**
   * Check if a migration has been applied
   */
  async isMigrationApplied(migrationName: string): Promise<boolean> {
    const { data, error } = await this.supabase
      .from('supabase_migrations')
      .select('name')
      .eq('name', migrationName)
      .single()

    if (error && error.code !== 'PGRST116') {
      throw error
    }

    return !!data
  }

  /**
   * Get list of applied migrations
   */
  async getAppliedMigrations(): Promise<string[]> {
    const { data, error } = await this.supabase
      .from('supabase_migrations')
      .select('name')
      .order('name')

    if (error) {
      throw error
    }

    return data?.map(m => m.name) || []
  }

  /**
   * Manually execute a SQL migration (use with caution)
   */
  async executeSql(sql: string): Promise<void> {
    const { error } = await this.supabase.rpc('exec_sql', { sql_query: sql })
    
    if (error) {
      throw error
    }
  }

  /**
   * Create default categories for a user
   */
  async createDefaultCategories(userId: string): Promise<void> {
    const defaultCategories = [
      { name: 'Food & Dining', color: '#EF4444', icon: '🍽️', type: 'expense' },
      { name: 'Transportation', color: '#3B82F6', icon: '🚗', type: 'expense' },
      { name: 'Shopping', color: '#8B5CF6', icon: '🛍️', type: 'expense' },
      { name: 'Entertainment', color: '#F59E0B', icon: '🎬', type: 'expense' },
      { name: 'Bills & Utilities', color: '#DC2626', icon: '⚡', type: 'expense' },
      { name: 'Healthcare', color: '#10B981', icon: '🏥', type: 'expense' },
      { name: 'Education', color: '#6366F1', icon: '📚', type: 'expense' },
      { name: 'Travel', color: '#06B6D4', icon: '✈️', type: 'expense' },
      { name: 'Insurance', color: '#84CC16', icon: '🛡️', type: 'expense' },
      { name: 'Personal Care', color: '#EC4899', icon: '💄', type: 'expense' },
      { name: 'Salary', color: '#22C55E', icon: '💰', type: 'income' },
      { name: 'Freelance', color: '#10B981', icon: '💼', type: 'income' },
      { name: 'Business', color: '#6366F1', icon: '🏢', type: 'income' },
      { name: 'Investments', color: '#8B5CF6', icon: '📈', type: 'income' },
      { name: 'Rental Income', color: '#F59E0B', icon: '🏠', type: 'income' },
      { name: 'Other Income', color: '#6B7280', icon: '💵', type: 'income' }
    ]

    const categoriesToInsert = defaultCategories.map(cat => ({
      ...cat,
      user_id: userId
    }))

    const { error } = await this.supabase
      .from('categories')
      .insert(categoriesToInsert)

    if (error && !error.message.includes('duplicate key')) {
      throw error
    }
  }
}