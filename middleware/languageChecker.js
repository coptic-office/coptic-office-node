let {appLanguages, smsLanguages} = require('../lookups/languages')

const checkAppLang = (req, res, next) => {
    const languageCode = req.headers['accept-language'];
    if (languageCode === undefined) {
        return res.status(400).json({
            status: "failed",
            error: "The accept-language header should be included in the request",
            message: {
                info: sortLanguages(appLanguages, 'language')
            }
        })
    }
    else {
        if (!checkLanguage(languageCode, appLanguages)) {
            return res.status(400).json({
                status: "failed",
                error: "The language in accept-language header is invalid or not supported",
                message: {
                    info: sortLanguages(appLanguages, 'language')
                }
            })
        }
    }
    next();
}

const checkSmsLang = (req, res, next) => {
    const {smsLangCode} = req.body
    if (smsLangCode === undefined) {
        return res.status(400).json({
            status: "failed",
            error: req.i18n.t('sms.languageRequired'),
            info: sortLanguages(smsLanguages, 'language')
        })
    }
    else {
        for (let i in smsLanguages) {
            if (smsLanguages[i].code.toUpperCase() === smsLangCode.toUpperCase()) {
                req.body.otpMessage = smsLanguages[i].otpMessage;
                return next();
            }
        }
        smsLanguages = smsLanguages.map((element) => {
            element.otpMessage = undefined;
            return element;
        })
        return res.status(400).json({
            status: "failed",
            error: req.i18n.t('sms.invalidLanguage'),
            message: {
                info: sortLanguages(smsLanguages, 'language')
            }
        })
    }
}

const sortLanguages = (languages, key) => {
    return languages.sort((a, b) => {
        const nameA = a[key].toUpperCase();
        const nameB = b[key].toUpperCase();
        if (nameA < nameB) {
            return -1;
        }
        if (nameA > nameB) {
            return 1;
        }
        return 0;
    })
}

const checkLanguage = (languageCode, languages) => {
    for (let i in languages) {
        if (languages[i].code.toUpperCase() === languageCode.toUpperCase()) {
            return true;
        }
    }
    return false;
}

module.exports = {checkAppLang, checkSmsLang};
