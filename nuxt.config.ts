// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  runtimeConfig: {
    /** Shared with the multiplayer server (signs player tokens): NUXT_MULTIPLAYER_SECRET */
    multiplayerSecret: '',
    public: {
      /**
       * Colyseus server: NUXT_PUBLIC_MULTIPLAYER_URL. Empty = same address as the app (production,
       * multiplayer/serve.ts); in development the standalone server from `pnpm dev:mp`.
       */
      multiplayerUrl: ''
    }
  },

  nitro: {
    // only the request handler: multiplayer/serve.ts runs it next to the multiplayer server on one port
    preset: 'node-listener',
    serveStatic: true
  },

  modules: [
    '@nuxt/eslint',
    '@nuxt/ui',
    '@nuxt/content',
    '@nuxt/fonts',
    '@tresjs/nuxt',
    // sessions in a sealed cookie + Authentik login (NUXT_SESSION_PASSWORD, NUXT_OAUTH_AUTHENTIK_*)
    'nuxt-auth-utils',
    // installable, works offline (service worker + precached assets)
    '@vite-pwa/nuxt'
  ],

  routeRules: {
    // client-only app shell: what the service worker serves for any page while offline
    '/app-shell': { ssr: false, prerender: true }
  },

  pwa: {
    registerType: 'prompt',
    manifest: {
      name: 'Peridea Rising',
      short_name: 'Peridea',
      description: 'Galaktisches Aufbau- und Handelsspiel: Planeten besiedeln, Rohstoffe handeln, Hyperraumrouten bauen.',
      lang: 'de',
      theme_color: '#02040a',
      background_color: '#02040a',
      display: 'fullscreen',
      start_url: '/game-modes',
      icons: [
        { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
        { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
        { src: '/maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
      ]
    },
    workbox: {
      // everything the game needs offline: app code, fonts, models, textures, images
      globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,jpg,woff,woff2,ttf,TTF,glb,json}'],
      maximumFileSizeToCacheInBytes: 16 * 1024 * 1024,
      // pages are rendered on the server and never cached (they contain the session);
      // offline, every navigation gets the app shell instead
      navigateFallback: null,
      runtimeCaching: [
        {
          urlPattern: ({ request }) => request.mode === 'navigate',
          handler: 'NetworkOnly',
          options: { precacheFallback: { fallbackURL: '/app-shell' } }
        },
        {
          // icons outside the client bundle
          urlPattern: ({ url }) => url.pathname.startsWith('/api/_nuxt_icon/'),
          handler: 'StaleWhileRevalidate',
          options: { cacheName: 'icons', expiration: { maxEntries: 200 } }
        }
      ]
    },
    client: {
      // checked again every hour while the app is open
      periodicSyncForUpdates: 60 * 60
    }
  },

  icon: {
    serverBundle: {
      collections: ['lucide', 'fa6-brands', 'simple-icons']
    },
    // offline the icon API can't be reached: ship every icon the app uses with the client
    clientBundle: {
      scan: { globInclude: ['app/**/*.{vue,ts}', 'shared/**/*.ts'] },
      // Nuxt UI's own icons (not found by the scan)
      icons: [
        'lucide:check', 'lucide:x', 'lucide:chevron-down', 'lucide:chevron-up', 'lucide:chevron-left', 'lucide:chevron-right',
        'lucide:chevrons-left', 'lucide:chevrons-right', 'lucide:arrow-left', 'lucide:arrow-right', 'lucide:arrow-up', 'lucide:arrow-down',
        'lucide:loader-circle', 'lucide:circle-alert', 'lucide:circle-check', 'lucide:circle-x', 'lucide:info', 'lucide:triangle-alert',
        'lucide:minus', 'lucide:plus', 'lucide:eye', 'lucide:eye-off', 'lucide:search', 'lucide:ellipsis', 'lucide:menu', 'lucide:copy', 'lucide:copy-check'
      ],
      sizeLimitKb: 512
    }
  },

  devtools: {
    enabled: true
  },

  css: ['~/assets/css/main.css'],

  colorMode: {
    preference: 'dark'
  },

  compatibilityDate: '2026-06-30',

  eslint: {
    config: {
      stylistic: false
    }
  }
})