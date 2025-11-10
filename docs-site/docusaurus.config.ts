import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'PersonalFinance Bot Guide',
  tagline: 'Everything Telegram users need to master their money.',
  favicon: 'img/favicon.ico',
  future: {
    v4: true,
  },
  url: 'https://aw09.github.io',
  baseUrl: '/PersonalFinance/',
  organizationName: 'aw09',
  projectName: 'PersonalFinance',
  onBrokenLinks: 'throw',
  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },
  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          editUrl: 'https://github.com/aw09/PersonalFinance/tree/development/docs-site/',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],
  themeConfig: {
    image: 'img/docusaurus-social-card.jpg',
    colorMode: {
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: 'PersonalFinance Guide',
      logo: {
        alt: 'PersonalFinance Logo',
        src: 'img/logo.svg',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'tutorialSidebar',
          position: 'left',
          label: 'Docs',
        },
        {
          href: 'https://github.com/aw09/PersonalFinance',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Guide',
          items: [
            {label: 'Start here', to: '/docs/intro'},
            {label: 'Command reference', to: '/docs/command-reference'},
          ],
        },
        {
          title: 'Resources',
          items: [
            {label: 'API RapiDoc', href: 'https://your-backend-host/docs/rapidoc'},
            {label: 'Repository', href: 'https://github.com/aw09/PersonalFinance'},
          ],
        },
        {
          title: 'Support',
          items: [
            {label: 'Report an issue', href: 'https://github.com/aw09/PersonalFinance/issues'},
            {label: 'Contact maintainer', href: 'https://t.me/your_bot_handle'},
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} PersonalFinance.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
