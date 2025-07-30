-- Default categories for new users
-- This script should be run when creating a new user's profile

INSERT INTO categories (name, color, icon, type, user_id) VALUES
  ('Food & Dining', '#EF4444', '🍽️', 'expense', $1),
  ('Transportation', '#3B82F6', '🚗', 'expense', $1),
  ('Shopping', '#8B5CF6', '🛍️', 'expense', $1),
  ('Entertainment', '#F59E0B', '🎬', 'expense', $1),
  ('Bills & Utilities', '#DC2626', '⚡', 'expense', $1),
  ('Healthcare', '#10B981', '🏥', 'expense', $1),
  ('Education', '#6366F1', '📚', 'expense', $1),
  ('Travel', '#06B6D4', '✈️', 'expense', $1),
  ('Insurance', '#84CC16', '🛡️', 'expense', $1),
  ('Personal Care', '#EC4899', '💄', 'expense', $1),
  ('Salary', '#22C55E', '💰', 'income', $1),
  ('Freelance', '#10B981', '💼', 'income', $1),
  ('Business', '#6366F1', '🏢', 'income', $1),
  ('Investments', '#8B5CF6', '📈', 'income', $1),
  ('Rental Income', '#F59E0B', '🏠', 'income', $1),
  ('Other Income', '#6B7280', '💵', 'income', $1)
ON CONFLICT (name, type, user_id) DO NOTHING;