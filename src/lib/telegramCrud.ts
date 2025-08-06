import { createTelegramSupabase } from './telegramAuth';

// Wallet operations
export async function getTelegramUserWallets(telegramUserId: number) {
  const supabase = createTelegramSupabase();
  
  const { data: wallets, error } = await supabase
    .from('wallets')
    .select('*')
    .eq('owner_id', (
      await supabase
        .from('profiles')
        .select('id')
        .eq('telegram_user_id', telegramUserId)
        .single()
    ).data?.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching wallets:', error);
    return [];
  }

  return wallets || [];
}

export async function createTelegramUserWallet(
  telegramUserId: number,
  name: string,
  description?: string,
  currency: string = 'USD'
) {
  const supabase = createTelegramSupabase();
  
  // Get user ID
  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('telegram_user_id', telegramUserId)
    .single();

  if (!profile) {
    throw new Error('User not found');
  }

  const { data: wallet, error } = await supabase
    .from('wallets')
    .insert({
      name,
      description,
      currency,
      owner_id: profile.id
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating wallet:', error);
    throw error;
  }

  return wallet;
}

export async function updateTelegramUserWallet(
  telegramUserId: number,
  walletId: string,
  updates: { name?: string; description?: string; currency?: string }
) {
  const supabase = createTelegramSupabase();
  
  // Get user ID
  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('telegram_user_id', telegramUserId)
    .single();

  if (!profile) {
    throw new Error('User not found');
  }

  const { data: wallet, error } = await supabase
    .from('wallets')
    .update({
      ...updates,
      updated_at: new Date().toISOString()
    })
    .eq('id', walletId)
    .eq('owner_id', profile.id)
    .select()
    .single();

  if (error) {
    console.error('Error updating wallet:', error);
    throw error;
  }

  return wallet;
}

export async function deleteTelegramUserWallet(
  telegramUserId: number,
  walletId: string
) {
  const supabase = createTelegramSupabase();
  
  // Get user ID
  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('telegram_user_id', telegramUserId)
    .single();

  if (!profile) {
    throw new Error('User not found');
  }

  // Check if wallet has transactions
  const { count } = await supabase
    .from('transactions')
    .select('*', { count: 'exact', head: true })
    .eq('wallet_id', walletId)
    .eq('user_id', profile.id);

  if (count && count > 0) {
    throw new Error('Cannot delete wallet with existing transactions');
  }

  const { error } = await supabase
    .from('wallets')
    .delete()
    .eq('id', walletId)
    .eq('owner_id', profile.id);

  if (error) {
    console.error('Error deleting wallet:', error);
    throw error;
  }

  return true;
}

// Transaction operations
export async function getTelegramUserTransactions(
  telegramUserId: number,
  walletId?: string,
  limit: number = 10
) {
  const supabase = createTelegramSupabase();
  
  // Get user ID
  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('telegram_user_id', telegramUserId)
    .single();

  if (!profile) {
    return [];
  }

  let query = supabase
    .from('transactions')
    .select(`
      *,
      categories (name, color, icon),
      wallets (name, currency)
    `)
    .eq('user_id', profile.id)
    .order('date', { ascending: false })
    .limit(limit);

  if (walletId) {
    query = query.eq('wallet_id', walletId);
  }

  const { data: transactions, error } = await query;

  if (error) {
    console.error('Error fetching transactions:', error);
    return [];
  }

  return transactions || [];
}

export async function createTelegramUserTransaction(
  telegramUserId: number,
  walletId: string,
  amount: number,
  description: string,
  type: 'income' | 'expense',
  categoryId?: string
) {
  const supabase = createTelegramSupabase();
  
  // Get user ID
  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('telegram_user_id', telegramUserId)
    .single();

  if (!profile) {
    throw new Error('User not found');
  }

  const { data: transaction, error } = await supabase
    .from('transactions')
    .insert({
      amount,
      description,
      type,
      category_id: categoryId,
      wallet_id: walletId,
      user_id: profile.id
    })
    .select(`
      *,
      categories (name, color, icon),
      wallets (name, currency)
    `)
    .single();

  if (error) {
    console.error('Error creating transaction:', error);
    throw error;
  }

  return transaction;
}

export async function updateTelegramUserTransaction(
  telegramUserId: number,
  transactionId: string,
  updates: { 
    amount?: number; 
    description?: string; 
    type?: 'income' | 'expense';
    category_id?: string;
  }
) {
  const supabase = createTelegramSupabase();
  
  // Get user ID
  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('telegram_user_id', telegramUserId)
    .single();

  if (!profile) {
    throw new Error('User not found');
  }

  const { data: transaction, error } = await supabase
    .from('transactions')
    .update({
      ...updates,
      updated_at: new Date().toISOString()
    })
    .eq('id', transactionId)
    .eq('user_id', profile.id)
    .select(`
      *,
      categories (name, color, icon),
      wallets (name, currency)
    `)
    .single();

  if (error) {
    console.error('Error updating transaction:', error);
    throw error;
  }

  return transaction;
}

export async function deleteTelegramUserTransaction(
  telegramUserId: number,
  transactionId: string
) {
  const supabase = createTelegramSupabase();
  
  // Get user ID
  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('telegram_user_id', telegramUserId)
    .single();

  if (!profile) {
    throw new Error('User not found');
  }

  const { error } = await supabase
    .from('transactions')
    .delete()
    .eq('id', transactionId)
    .eq('user_id', profile.id);

  if (error) {
    console.error('Error deleting transaction:', error);
    throw error;
  }

  return true;
}

// Category operations
export async function getTelegramUserCategories(telegramUserId: number) {
  const supabase = createTelegramSupabase();
  
  // Get user ID
  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('telegram_user_id', telegramUserId)
    .single();

  if (!profile) {
    return [];
  }

  const { data: categories, error } = await supabase
    .from('categories')
    .select('*')
    .eq('user_id', profile.id)
    .order('type', { ascending: true })
    .order('name', { ascending: true });

  if (error) {
    console.error('Error fetching categories:', error);
    return [];
  }

  return categories || [];
}

export async function createTelegramUserCategory(
  telegramUserId: number,
  name: string,
  type: 'income' | 'expense',
  color?: string,
  icon?: string
) {
  const supabase = createTelegramSupabase();
  
  // Get user ID
  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('telegram_user_id', telegramUserId)
    .single();

  if (!profile) {
    throw new Error('User not found');
  }

  const { data: category, error } = await supabase
    .from('categories')
    .insert({
      name,
      type,
      color: color || '#6B7280',
      icon,
      user_id: profile.id
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating category:', error);
    throw error;
  }

  return category;
}

// Budget operations  
export async function getTelegramUserBudgets(telegramUserId: number) {
  const supabase = createTelegramSupabase();
  
  // Get user ID
  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('telegram_user_id', telegramUserId)
    .single();

  if (!profile) {
    return [];
  }

  const { data: budgets, error } = await supabase
    .from('budgets')
    .select(`
      *,
      categories (name, color, icon),
      wallets (name, currency)
    `)
    .eq('user_id', profile.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching budgets:', error);
    return [];
  }

  return budgets || [];
}

export async function createTelegramUserBudget(
  telegramUserId: number,
  walletId: string,
  name: string,
  amount: number,
  period: 'weekly' | 'monthly' | 'yearly' = 'monthly',
  categoryId?: string
) {
  const supabase = createTelegramSupabase();
  
  // Get user ID
  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('telegram_user_id', telegramUserId)
    .single();

  if (!profile) {
    throw new Error('User not found');
  }

  const { data: budget, error } = await supabase
    .from('budgets')
    .insert({
      name,
      amount,
      period,
      category_id: categoryId,
      wallet_id: walletId,
      user_id: profile.id
    })
    .select(`
      *,
      categories (name, color, icon),
      wallets (name, currency)
    `)
    .single();

  if (error) {
    console.error('Error creating budget:', error);
    throw error;
  }

  return budget;
}

// Investment operations
export async function getTelegramUserInvestments(telegramUserId: number) {
  const supabase = createTelegramSupabase();
  
  // Get user ID
  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('telegram_user_id', telegramUserId)
    .single();

  if (!profile) {
    return [];
  }

  const { data: investments, error } = await supabase
    .from('investments')
    .select(`
      *,
      wallets (name, currency)
    `)
    .eq('user_id', profile.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching investments:', error);
    return [];
  }

  return investments || [];
}

export async function createTelegramUserInvestment(
  telegramUserId: number,
  walletId: string,
  name: string,
  type: string,
  initialAmount: number,
  currentValue: number,
  quantity?: number
) {
  const supabase = createTelegramSupabase();
  
  // Get user ID
  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('telegram_user_id', telegramUserId)
    .single();

  if (!profile) {
    throw new Error('User not found');
  }

  const { data: investment, error } = await supabase
    .from('investments')
    .insert({
      name,
      type,
      initial_amount: initialAmount,
      current_value: currentValue,
      quantity,
      wallet_id: walletId,
      user_id: profile.id
    })
    .select(`
      *,
      wallets (name, currency)
    `)
    .single();

  if (error) {
    console.error('Error creating investment:', error);
    throw error;
  }

  return investment;
}