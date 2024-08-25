const debug = require('debug');
const errorLog = debug('app-system:error');

const paymentCallback = async (req, res) => {
    try {
        const {resultIndicator, sessionVersion} = await req.body;

        console.log(`resultIndicator: ${resultIndicator}`)
        console.log(`sessionVersion: ${sessionVersion}`)

        res.status(200).json({})

    }
    catch (err) {
        console.log('Error while calling callback function')
        res.status(500).json({})
    }
}

module.exports = {paymentCallback}