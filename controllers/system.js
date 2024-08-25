const debug = require('debug');
const errorLog = debug('app-system:error');

const paymentCallback = async (req, res) => {
    try {
        const {resultIndicator, sessionVersion} = await req.query;
        // res.redirect('https://copticoffice.com/')
        res.status(200).json({
            status: "success",
            error: "",
            message: {
                resultIndicator,
                sessionVersion
            }
        })

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