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
                .then(() => {
                    res.redirect(process.env.PAYMENT_SUCCESS_URL);
                })
                .catch((err) => {
                    switch (err.toString()) {
                        case 'invalidIndicator':
                        case 'internalError':
                            res.redirect(process.env.PAYMENT_UNVERIFIED_URL);
                            break;

                        case 'completionError':
                            res.redirect(process.env.PAYMENT_INCOMPLETE_URL);
                            break;

                        default:
                            errorLog(`Uncaught error in the Switch statement\nError: ${err}`)
                            res.redirect('https://www.facebook.com/');
                    }
                });
        }
    }
    catch (err) {
        errorLog(`Error while calling payment callback\nError: ${err}`)
        res.redirect(process.env.PAYMENT_UNVERIFIED_URL);
    }
}

module.exports = {paymentCallback}