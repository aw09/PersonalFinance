import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

/**
 * Creating a sidebar enables you to:
 - create an ordered group of docs
 - render a sidebar for each doc of that group
 - provide next/previous navigation

 The sidebars can be generated from the filesystem, or explicitly defined here.

 Create as many sidebars as you want.
 */
const sidebars: SidebarsConfig = {
  tutorialSidebar: [
    {
      type: 'category',
      label: 'Overview',
      collapsible: false,
      items: ['intro', 'getting-started', 'command-reference'],
    },
    {
      type: 'category',
      label: 'Wallets & Assets',
      items: ['wallets-and-balances', 'credit-and-investment', 'receipts-and-automation'],
    },
    {
      type: 'category',
      label: 'Insights',
      items: ['reports-and-history'],
    },
    {
      type: 'category',
      label: 'Help',
      items: ['troubleshooting', 'faq'],
    },
    {
      type: 'category',
      label: 'Maintainers',
      items: ['deploying-docs'],
    },
  ],
};

export default sidebars;
