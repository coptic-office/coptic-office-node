const debug = require('debug');
const errorLog = debug('app-system:error');
const Payment = require('../controllers/payments');

const paymentCallback = async (req, res) => {
    try {
        const {resultIndicator, sessionVersion} = await req.query;

        if (resultIndicator === undefined) {
            res.redirect('https://tech-worx.ca/')
        }
        else {
            Payment.findPayment(resultIndicator)
                .then(() => {

                    res.redirect('https://copticoffice.com/')
                })
                .catch((err) => {

                    res.redirect('https://tech-worx.ca/index.php/about/')
                });
        }
    }
    catch (err) {
        console.log('Error while calling callback function')
        res.status(500).json({
            status: "failed",
            error: err.toString(),
            message: {}
        })
    }
}

module.exports = {paymentCallback}