const debug = require('debug');
const log = debug('app-smsConnectors:info');
const errorLog = debug('app-smsConnectors:error');
const axios = require("axios");
const crypto = require('crypto');
const {getCountry} = require("../controllers/countries");
const {getBestPrice} = require('../controllers/priceCatalogs');
const smsGlobal = require('smsglobal')(process.env.SMS_GLOBAL_API_KEY, process.env.SMS_GLOBAL_API_SECRET);
const twilio = require('twilio')(process.env.SMS_TWILIO_ACCOUNT_SID, process.env.SMS_TWILIO_AUTH_TOKEN);

const sendVictoryLink = (number, message, senderID) => {
    return new Promise((myResolve, myReject) => {
        axios.post(process.env.SMS_VL_URL, {
            UserName: process.env.SMS_VL_USER_NAME,
            Password: process.env.SMS_VL_PASSWORD,
            SMSText: message,
            SMSLang: 'e',
            SMSSender: senderID,
            SMSReceiver: number,
            SMSID: crypto.randomUUID()
        })
            .then((msg) => {
                if (msg.data === 0) {
                    log(`SMS sent to ${number} using Victory Link`);
                    myResolve(`SMS sent to ${number}`);
                    return;
                }

                const errMessage = `SMS failed to be sent to ${number}`
                switch (msg.data) {
                    case -1:
                        errorLog(`${errMessage}, bad credentials (-1)`);
                        myReject(`${errMessage}, bad credentials (-1)`);
                        break;
                    case -5:
                        errorLog(`${errMessage}, out of credit (-5)`);
                        myReject(`${errMessage}, out of credit (-5)`);
                        break;
                    case -11:
                        errorLog(`${errMessage}, invalid language (-11)`);
                        myReject(`${errMessage}, invalid language (-11)`);
                        break;
                    case -12:
                        errorLog(`${errMessage}, SMS is empty (-12)`);
                        myReject(`${errMessage}, SMS is empty (-12)`);
                        break;
                    case -13:
                        errorLog(`${errMessage}, invalid sender (-13)`);
                        myReject(`${errMessage}, invalid sender (-13)`);
                        break;
                    case -100:
                        errorLog(`${errMessage}, general error (-100)`);
                        myReject(`${errMessage}, general error (-100)`);
                        break;
                    default:
                        errorLog(`${errMessage}, contact the service provider (${msg.data})`);
                        myReject(`${errMessage}, contact the service provider (${msg.data})`);
                        break;
                }
            })
            .catch((err) => {
                errorLog(`SMS failed to be sent to ${number}, ${err}`);
                myReject(`SMS failed to be sent to ${number}, ${err}`);
            })
    })

}

const sendTwilio = (number, message, senderID) => {
    return new Promise((myResolve, myReject) => {
        twilio.messages.create({
            from: senderID,
            body: message,
            to: number
        })
            .then((msg) => {
                log(`SMS sent to ${number} using Twilio`);
                myResolve(`SMS sent to ${number}`);
            })
            .catch((err) => {
                const errMessage = `SMS failed to be sent to ${number}`
                switch (err.code) {
                    case 20003:
                        errorLog(`${errMessage}, Permission Denied (${err.code})`);
                        myReject(`${errMessage}, Permission Denied (${err.code})`);
                        break;
                    case 21211:
                        errorLog(`${errMessage}, Invalid phone number (${err.code})`);
                        myReject(`${errMessage}, Invalid phone number (${err.code})`);
                        break;
                    case 21407:
                        errorLog(`${errMessage}, This Phone Number type does not support SMS (${err.code})`);
                        myReject(`${errMessage}, This Phone Number type does not support SMS (${err.code})`);
                        break;
                    case 21408:
                        errorLog(`${errMessage}, Permission not enabled to send SMSs to the region of that number (${err.code})`);
                        myReject(`${errMessage}, Permission not enabled to send SMSs to the region of that number (${err.code})`);
                        break;
                    default:
                        errorLog(`${errMessage}, contact the service provider (${err.code})`);
                        myReject(`${errMessage}, contact the service provider (${err.code})`);
                        break;
                }
            })
    })
}

const sendSmsGlobal = (number, message, senderID) => {
    return new Promise((myResolve, myReject) => {
        smsGlobal.sms.send({
            origin: senderID,
            destination: number,
            message
        }, (err, _) => {
            if (err) {
                const errMessage = `SMS failed to be sent to ${number}`
                switch (err.statusCode) {
                    case 400:
                        errorLog(`${errMessage}, Bad Request, invalid or missing data (400)`);
                        myReject(`${errMessage}, Bad Request, invalid or missing data (400)`);
                        break;
                    case 401:
                        errorLog(`${errMessage}, Authentication failed (401)`);
                        myReject(`${errMessage}, Authentication failed (401)`);
                        break;
                    case 403:
                        errorLog(`${errMessage}, HMAC-SHA Authentication Failed (403)`);
                        myReject(`${errMessage}, HMAC-SHA Authentication Failed (403)`);
                        break;
                    default:
                        errorLog(`${errMessage}, contact the service provider (${err.statusCode})`);
                        myReject(`${errMessage}, contact the service provider (${err.statusCode})`);
                        break;
                }
            }
            else {
                log(`SMS sent to ${number} using SMS Global`);
                myResolve(`SMS sent to ${number}`);
            }
        })
    })
}

const sendSMS = (message, number, country) => {
    return new Promise((myResolve, myReject) => {
        getCountry({name: country})
            .then((targetCountry) => {
                const {senderID} = targetCountry;
                getBestPrice(country)
                    .then((selectedAggregator) => {
                        const {aggregator, price} = selectedAggregator;
                        switch (aggregator) {
                            case 'Victory Link':
                                sendVictoryLink(number, message, senderID)
                                    .then((msg) => myResolve({msg, aggregator, price}))
                                    .catch((err) => myReject(err));
                                break;
                            case 'Twilio':
                                sendTwilio(number, message, senderID)
                                    .then((msg) => myResolve({msg, aggregator, price}))
                                    .catch((err) => myReject(err));
                                break;
                            case 'SMS Global':
                                sendSmsGlobal(number, message, senderID)
                                    .then((msg) => myResolve({msg, aggregator, price}))
                                    .catch((err) => myReject(err));
                                break;
                        }
                    })
                    .catch((err) => {
                        myReject(`SMS failed to be sent to ${number}, ${err}`);
                    })
            })
            .catch((err) => {
                myReject(`SMS failed to be sent to ${number}, ${err}`);
            })
    })
}

module.exports = sendSMS;
