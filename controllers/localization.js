const i18next = require('i18next');
const i18nextMiddleware = require('i18next-http-middleware');
const Backend = require('i18next-node-fs-backend');
const path = require('path');

i18next
    .use(i18nextMiddleware.LanguageDetector)
    .use(Backend)
    .init({
        backend: {
            loadPath: path.join('./locales', '{{lng}}', '{{ns}}.json')

        },
        debug: false,
        detection: {
            // order: ['header', 'cookie', 'querystring'],
            order: ['header'],
            caches: ['cookie']
        },
        lng: 'en',
        fallBackLng: ['en'],
        preload: ['en', 'ar'],
        saveMissing: true
    });

module.exports = {i18next, i18nextMiddleware}