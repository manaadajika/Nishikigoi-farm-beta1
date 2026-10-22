import corePackage from '@tabler/core/package.json'

const version = corePackage.version

export const site = {
  title: 'Nishikigoi',
  version,
  docsUrl: 'https://docs.tabler.io',
  cdnUrl: `https://cdn.jsdelivr.net/npm/@tabler/core@${version}`,
  email: 'support@tabler.io',
  previewUrl: 'https://preview.tabler.io',
  githubUrl: 'https://github.com/tabler/tabler',
  githubSponsorsUrl: 'https://github.com/sponsors/codecalm',
  icons: { link: 'https://tabler.io/icons' },
  // From shared/data/site.json. Empty `count` keeps the "Buy  emails" double space.
  emails: { price: '$29', buy_link: 'https://r.tabler.io/buy-emails', count: '' },
  // Dev Google Maps API key for local development builds.
  googleMapsDevKey: '',
  // From shared/data/icons-info.json.
  iconsCount: 5986,
  descriptionShort: 'Manajemen koi farm.',
  description: 'Aplikasi manajemen koi farm.',
  themeColor: '#066fd1',
  cssPlugins: ['flags', 'socials', 'payments', 'vendors', 'marketing', 'themes'],
  themeColors: ['blue', 'azure', 'indigo', 'purple', 'pink', 'red', 'orange', 'yellow', 'lime', 'green', 'teal', 'cyan'],
  themeFonts: ['sans-serif', 'serif', 'monospace', 'comic'],
  themeBases: ['slate', 'gray', 'zinc', 'neutral', 'stone'],
  themeRadiuses: ['0', '0.5', '1', '1.5', '2'],
}
