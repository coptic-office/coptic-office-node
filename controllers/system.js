const debug = require('debug');
const errorLog = debug('app-system:error');
const Payment = require('../controllers/payments');

const paymentCallback = async (req, res) => {
    try {
        const {resultIndicator, sessionVersion} = await req.query;

        if (resultIndicator === undefined) {
            res.redirect(process.env.PAYMENT_FAILURE_URL);
        }
        else {
            Payment.findPayment(resultIndicator)
                .then(({locale}) => {
                    const successUrl = process.env.PAYMENT_SUCCESS_URL.replace('{{locale}}', locale);
                    res.redirect(successUrl);
                })
                .catch(({err, locale}) => {
                    const unverifiedUrl = process.env.PAYMENT_UNVERIFIED_URL.replace('{{locale}}', locale);
                    const incompleteUrl = process.env.PAYMENT_INCOMPLETE_URL.replace('{{locale}}', locale);
                    switch (err.toString()) {
                        case 'invalidIndicator':
                        case 'internalError':
                            res.redirect(unverifiedUrl);
                            break;

                        case 'completionError':
                            res.redirect(incompleteUrl);
                            break;

                        default:
                            errorLog(`Uncaught error in the Switch statement\nError: ${err}`)
                            res.redirect(unverifiedUrl);
                    }
                });
        }
    }
    catch (err) {
        errorLog(`Failed while calling payment callback\nError: ${err}`)
        res.redirect(process.env.PAYMENT_UNVERIFIED_URL.replace('{{locale}}', 'ar'));
    }
}

module.exports = {paymentCallback}