-- Default categories seed data for the Personal Finance application
-- This is used to populate default categories when seeding the database

INSERT INTO categories (name, color, icon, type, user_id) VALUES
  ('Food & Dining', '#EF4444', '🍽️', 'expense', '00000000-0000-0000-0000-000000000000'), -- Default user for system categories
  ('Transportation', '#3B82F6', '🚗', 'expense', '00000000-0000-0000-0000-000000000000'),
  ('Shopping', '#8B5CF6', '🛍️', 'expense', '00000000-0000-0000-0000-000000000000'),
  ('Entertainment', '#F59E0B', '🎬', 'expense', '00000000-0000-0000-0000-000000000000'),
  ('Bills & Utilities', '#DC2626', '⚡', 'expense', '00000000-0000-0000-0000-000000000000'),
  ('Healthcare', '#10B981', '🏥', 'expense', '00000000-0000-0000-0000-000000000000'),
  ('Education', '#6366F1', '📚', 'expense', '00000000-0000-0000-0000-000000000000'),
  ('Travel', '#06B6D4', '✈️', 'expense', '00000000-0000-0000-0000-000000000000'),
  ('Insurance', '#84CC16', '🛡️', 'expense', '00000000-0000-0000-0000-000000000000'),
  ('Personal Care', '#EC4899', '💄', 'expense', '00000000-0000-0000-0000-000000000000'),
  ('Salary', '#22C55E', '💰', 'income', '00000000-0000-0000-0000-000000000000'),
  ('Freelance', '#10B981', '💼', 'income', '00000000-0000-0000-0000-000000000000'),
  ('Business', '#6366F1', '🏢', 'income', '00000000-0000-0000-0000-000000000000'),
  ('Investments', '#8B5CF6', '📈', 'income', '00000000-0000-0000-0000-000000000000'),
  ('Rental Income', '#F59E0B', '🏠', 'income', '00000000-0000-0000-0000-000000000000'),
  ('Other Income', '#6B7280', '💵', 'income', '00000000-0000-0000-0000-000000000000')
ON CONFLICT (name, type, user_id) DO NOTHING;