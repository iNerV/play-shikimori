const permissions = [
    'webRequest',
    'webRequestBlocking',
    'storage',
    'tabs',
]

const origins = [
    'https://shikimori.one/*',
    'https://shikimori.me/*',
    'https://smotret-anime-365.ru/*',
    'https://smotret-anime.online/*',
    'https://api.jikan.moe/*',
]

const manifest = {
    manifest_version: 2,

    name: '__MSG_extName__',

    default_locale: 'ru',

    icons: {
        '192': 'play.png',
        '128': 'play-128.png',
    },

    minimum_chrome_version: '73',

    incognito: 'split',

    browser_action: {
        default_title: 'Открыть историю просмотров',
    },

    background: {
        page: 'background.html',
        persistent: true,
    },

    'options_ui': {
        'page': 'player.html#/options',
        'open_in_tab': false,
    },

    web_accessible_resources: [
        '*',
        'anime365-player-events.js',
    ],

    permissions: [
        ...permissions,
        ...origins,
    ],

    content_scripts: [
        {
            matches: [
                'https://shikimori.org/*',
                'https://shikimori.one/*',
                'https://shikimori.me/*',
            ],
            js: [
                'shikimori-watch-button.js',
            ],
            run_at: 'document_idle',
        },
        {
            matches: [
                'https://smotret-anime.online/translations/embed/*',
                'https://smotret-anime-365.ru/translations/embed/*',
                'https://hentai365.ru/translations/embed/*',
            ],
            js: [
                'anime-365-inject.js',
            ],
            css: [
                'css/anime-365-player.css',
            ],
            run_at: 'document_start',
            all_frames: true,
        },
        // 	{
        // 		matches: [
        // 			'https://myanimelist.net/anime/*',
        // 		],
        // 		js: [
        // 			'watch-button-myanime-list.js',
        // 		],
        // 		run_at: 'document_end',
        // 	},
    ],
}

if (process.env.BROWSER === 'firefox') {

    manifest.browser_specific_settings = {
        gecko: {
            id: process.env.FIREFOX_EXTENSION_ID,
            strict_min_version: '67.0',
        },
    }

    manifest.incognito = 'spanning'

}

module.exports = {
    default: manifest,
    permissions,
    origins,
}
