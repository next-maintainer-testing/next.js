/** @type {import('next').NextConfig} */
module.exports = {
  i18n: {
    defaultLocale: 'de',
    locales: ['de', 'fr', 'fr-en', 'nl', 'nl-en', 'it'],
    domains: [
      {
        domain: 'example.fr',
        defaultLocale: 'fr',
        locales: ['fr-en'],
      },
      {
        domain: 'example.nl',
        defaultLocale: 'nl',
        locales: ['nl-en'],
      },
    ],
  },
}
