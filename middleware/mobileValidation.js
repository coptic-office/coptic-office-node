const {getCountry, getCountries} = require('../controllers/countries');
const sendSMS = require('../utils/smsConnectors')
const numbers = require('../utils/codeGenerator');
const getCurrencyRate = require('../utils/currencyRates');
const sendEmail = require('../utils/emailSender');
const {verifyDomainName} = require('../utils/businessValidator')

const validateMobile = (req, res, next) => {
    if (req.body.mobile === undefined) {
        return res.status(400).json({
            status: "failed",
            error: req.i18n.t('register.mobileRequired'),
            message: {}
        })
    }
    else {
        let {countryCode, number} = req.body.mobile
        getCountry({code: countryCode.toUpperCase()})
            .then((targetCountry) => {
                if (!targetCountry) {
                    getCountries()
                        .then((countries) => {
                            return res.status(400)
                                .json({
                                    status: "failed",
                                    error: req.i18n.t('register.invalidCountry'),
                                    message: {
                                        info: countries
                                    }
                                })
                        })
                        .catch((err) => {
                            return res.status(400)
                                .json({
                                    status: "failed",
                                    error: req.i18n.t('register.invalidCountry'),
                                    message: {}
                                })
                        })
                }
                else {
                    const pattern = new RegExp(targetCountry.pattern);
                    const validNumber = pattern.test(number);
                    if(!validNumber) {
                        return res.status(400)
                            .json({
                                status: "failed",
                                error: req.i18n.t('register.invalidMobile'),
                                message: {}
                            })
                    }

                    if (number[0] === '0') {
                        number = number.slice(1)
                    }
                    number = `${targetCountry.key}${number}`
                    req.body.mobile.number = number
                    req.body.mobile.country = targetCountry.name

                    next();
                }
            })
            .catch((err) => {
                res.status(500)
                    .json({
                        status: "failed",
                        error: req.i18n.t('general.internalError'),
                        message: {
                            description: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
                        }
                    })
            })

        // verifyDomainName('dev.propertiano.com')
        //     .then(() => {
        //         console.log('Domain Confirmed')
        //     })
        //     .catch((err) => {
        //         console.log(err)
        //     })

        // let message = numbers.generateNumber(Number(process.env.OTP_DIGITS_NUMBER))
        // // message = numbers.separateNumber(message, '*')
        // sendSMS(message, number, targetCountry.name)
        //     .then((res) => {
        //         console.log(res)
        //     })
        //     .catch((err) => {
        //         console.log(err)
        //     })

        // getCurrencyRate('EGP', targetCountry.currency)
        //     .then((rate) => {
        //         console.log(rate)
        //     })
        //     .catch((err) => {
        //         console.log(err)
        //     })

        // sendEmail(req, {
        //     template: 'Welcome',
        //     receiver: req.body.email,
        //     OTP: numbers.generateNumber(6),
        // }).then().catch((err) => {})

        // sendEmail(req, {
        //     template: 'Reset Password',
        //     receiver: req.body.email,
        //     firstName: req.body.firstName,
        //     lastName: req.body.lastName,
        //     OTP: numbers.generateNumber(6),
        // }).then().catch((err) => {})

        // sendEmail(req, {
        //     template: 'Payment Receipt',
        //     receiver: req.body.email,
        //     firstName: req.body.firstName,
        //     lastName: req.body.lastName,
        //     bookingExpiry: 'Thursday, August 24, 2023, 6:00 PM',
        //     paymentReference: '9368764201',
        //     items: [
        //         {
        //             name: 'Booking Partial Payment',
        //             description: 'One-night down payment for the booking #4352652432',
        //             amount: '£E1,250'
        //         }
        //     ]
        // }).then().catch((err) => {})

    }
}

module.exports = validateMobile;
