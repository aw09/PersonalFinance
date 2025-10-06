// Telegram Bot UI Components and Messages

export interface InlineKeyboardButton {
  text: string;
  callback_data?: string;
  url?: string;
}

export interface InlineKeyboard {
  inline_keyboard: InlineKeyboardButton[][];
}

// Main menu keyboard (default: not linked)
export const mainMenuKeyboard: InlineKeyboard = getMainMenuKeyboard ? getMainMenuKeyboard(false) : {
  inline_keyboard: [
    [
      { text: '💼 Wallets', callback_data: 'menu_wallets' },
      { text: '💰 Transactions', callback_data: 'menu_transactions' }
    ],
    [
      { text: '📊 Budgets', callback_data: 'menu_budgets' },
      { text: '🏷️ Categories', callback_data: 'menu_categories' }
    ],
    [
      { text: '📈 Investments', callback_data: 'menu_investments' },
      { text: '🔗 Link Account', callback_data: 'menu_link' }
    ],
    [
      { text: 'ℹ️ Help', callback_data: 'menu_help' }
    ]
  ]
};

// Return a main menu keyboard adjusted for whether the user is linked.
// If linked=true, the Link Account button will be replaced with a non-action '✅ Linked' label.
export function getMainMenuKeyboard(linked: boolean): InlineKeyboard {
  const rows: InlineKeyboardButton[][] = [
    [
      { text: '💼 Wallets', callback_data: 'menu_wallets' },
      { text: '💰 Transactions', callback_data: 'menu_transactions' }
    ],
    [
      { text: '📊 Budgets', callback_data: 'menu_budgets' },
      { text: '🏷️ Categories', callback_data: 'menu_categories' }
    ],
    [
      { text: '📈 Investments', callback_data: 'menu_investments' },
      linked
        ? { text: '✅ Linked', callback_data: 'noop' }
        : { text: '🔗 Link Account', callback_data: 'menu_link' }
    ],
    [
      { text: 'ℹ️ Help', callback_data: 'menu_help' }
    ]
  ];

  return { inline_keyboard: rows };
}

// Wallet menu keyboard
export const walletMenuKeyboard: InlineKeyboard = {
  inline_keyboard: [
    [
      { text: '📋 List Wallets', callback_data: 'wallet_list' },
      { text: '➕ Create Wallet', callback_data: 'wallet_create' }
    ],
    [
      { text: '👁️ View Details', callback_data: 'wallet_view' },
      { text: '✏️ Edit Wallet', callback_data: 'wallet_edit' }
    ],
    [
      { text: '🗑️ Delete Wallet', callback_data: 'wallet_delete' }
    ],
    [
      { text: '🔙 Back to Main Menu', callback_data: 'menu_main' }
    ]
  ]
};

// Transaction menu keyboard
export const transactionMenuKeyboard: InlineKeyboard = {
  inline_keyboard: [
    [
      { text: '📋 List Transactions', callback_data: 'transaction_list' },
      { text: '➕ Add Transaction', callback_data: 'transaction_create' }
    ],
    [
      { text: '👁️ View Details', callback_data: 'transaction_view' },
      { text: '✏️ Edit Transaction', callback_data: 'transaction_edit' }
    ],
    [
      { text: '🗑️ Delete Transaction', callback_data: 'transaction_delete' }
    ],
    [
      { text: '🔙 Back to Main Menu', callback_data: 'menu_main' }
    ]
  ]
};

// Budget menu keyboard
export const budgetMenuKeyboard: InlineKeyboard = {
  inline_keyboard: [
    [
      { text: '📋 List Budgets', callback_data: 'budget_list' },
      { text: '➕ Create Budget', callback_data: 'budget_create' }
    ],
    [
      { text: '👁️ View Details', callback_data: 'budget_view' },
      { text: '✏️ Edit Budget', callback_data: 'budget_edit' }
    ],
    [
      { text: '🗑️ Delete Budget', callback_data: 'budget_delete' }
    ],
    [
      { text: '🔙 Back to Main Menu', callback_data: 'menu_main' }
    ]
  ]
};

// Category menu keyboard
export const categoryMenuKeyboard: InlineKeyboard = {
  inline_keyboard: [
    [
      { text: '📋 List Categories', callback_data: 'category_list' },
      { text: '➕ Create Category', callback_data: 'category_create' }
    ],
    [
      { text: '👁️ View Details', callback_data: 'category_view' },
      { text: '✏️ Edit Category', callback_data: 'category_edit' }
    ],
    [
      { text: '🗑️ Delete Category', callback_data: 'category_delete' }
    ],
    [
      { text: '🔙 Back to Main Menu', callback_data: 'menu_main' }
    ]
  ]
};

// Investment menu keyboard
export const investmentMenuKeyboard: InlineKeyboard = {
  inline_keyboard: [
    [
      { text: '📋 List Investments', callback_data: 'investment_list' },
      { text: '➕ Add Investment', callback_data: 'investment_create' }
    ],
    [
      { text: '👁️ View Details', callback_data: 'investment_view' },
      { text: '✏️ Edit Investment', callback_data: 'investment_edit' }
    ],
    [
      { text: '🗑️ Delete Investment', callback_data: 'investment_delete' }
    ],
    [
      { text: '🔙 Back to Main Menu', callback_data: 'menu_main' }
    ]
  ]
};

// Confirmation keyboard
export const confirmationKeyboard = (action: string, id?: string): InlineKeyboard => ({
  inline_keyboard: [
    [
      { text: '✅ Yes', callback_data: `confirm_${action}${id ? '_' + id : ''}` },
      { text: '❌ No', callback_data: 'cancel' }
    ]
  ]
});

// Back keyboard
export const backKeyboard = (menu: string): InlineKeyboard => ({
  inline_keyboard: [
    [
      { text: '🔙 Back', callback_data: `menu_${menu}` },
      { text: '🏠 Main Menu', callback_data: 'menu_main' }
    ]
  ]
});

// Cancel keyboard
export const cancelKeyboard: InlineKeyboard = {
  inline_keyboard: [
    [
      { text: '❌ Cancel', callback_data: 'cancel' }
    ]
  ]
};

// Welcome message
export const welcomeMessage = `
🏦 <b>Welcome to Personal Finance Bot!</b>

I can help you manage your:
💼 Wallets - Create and manage your financial accounts
💰 Transactions - Track income and expenses  
📊 Budgets - Set and monitor spending limits
🏷️ Categories - Organize your transactions
📈 Investments - Track your portfolio

<b>Getting Started:</b>
1. Link your account using the Link Account button
2. Create your first wallet
3. Start adding transactions

Use the menu below to navigate:
`;

// Account not linked message
export const accountNotLinkedMessage = `
🔗 <b>Account Not Linked</b>

Your Telegram account is not linked to a Personal Finance account yet.

To get started:
1. Create an account at ${process.env.NEXT_PUBLIC_SITE_URL || 'https://personalfinance-production.up.railway.app'}
2. Click "Link Account" in the main menu
3. Follow the instructions to connect your accounts

Once linked, you'll have full access to all features!
`;

// Help message
export const helpMessage = `
🆘 <b>Personal Finance Bot Help</b>

<b>Main Features:</b>
💼 <b>Wallets</b> - Manage your bank accounts, cash, cards
💰 <b>Transactions</b> - Record income and expenses
📊 <b>Budgets</b> - Set spending limits and track progress
🏷️ <b>Categories</b> - Organize transactions by type
📈 <b>Investments</b> - Track stocks, crypto, etc.

<b>Navigation:</b>
• Use the menu buttons to navigate
• Follow the conversation flow for actions
• You can always cancel operations
• Use /start to return to main menu

<b>Quick Commands:</b>
/start - Main menu
/help - This help message
/cancel - Cancel current operation

<b>Tips:</b>
• Always review details before confirming
• Use descriptive names for easy identification
• Set up categories first for better organization
`;

// Error messages
export const errorMessages = {
  generic: '❌ An error occurred. Please try again.',
  unauthorized: '🚫 You are not authorized to perform this action.',
  notFound: '❌ Item not found.',
  invalidInput: '❌ Invalid input. Please check your data.',
  networkError: '🌐 Network error. Please try again later.',
  accountRequired: '🔗 Please link your account first.',
  sessionExpired: '⏰ Session expired. Please start over.'
};

// Success messages
export const successMessages = {
  created: '✅ Successfully created!',
  updated: '✅ Successfully updated!',
  deleted: '🗑️ Successfully deleted!',
  linked: '🔗 Account successfully linked!'
};

// Format currency
export function formatCurrency(amount: number, currency: string = 'USD'): string {
  const localeMap: Record<string, string> = {
    IDR: 'id-ID',
    JPY: 'ja-JP',
    GBP: 'en-GB',
    EUR: 'de-DE',
    USD: 'en-US'
  };

  const locale = localeMap[currency] || 'en-US';

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency
  }).format(amount);
}

// Format date
export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(date));
}

// Create pagination keyboard
export function createPaginationKeyboard(
  currentPage: number,
  totalPages: number,
  baseCallback: string
): InlineKeyboard {
  const buttons: InlineKeyboardButton[][] = [];
  const navButtons: InlineKeyboardButton[] = [];

  if (currentPage > 1) {
    navButtons.push({ text: '◀️ Prev', callback_data: `${baseCallback}_page_${currentPage - 1}` });
  }

  navButtons.push({ text: `${currentPage}/${totalPages}`, callback_data: 'noop' });

  if (currentPage < totalPages) {
    navButtons.push({ text: 'Next ▶️', callback_data: `${baseCallback}_page_${currentPage + 1}` });
  }

  if (navButtons.length > 0) {
    buttons.push(navButtons);
  }

  buttons.push([
    { text: '🔙 Back', callback_data: 'menu_main' }
  ]);

  return { inline_keyboard: buttons };
}