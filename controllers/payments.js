const debug = require('debug');
const errorLog = debug('app-payment:error');
const Payment = require('../models/payments');
const {generateUUID} = require('../utils/codeGenerator');
const axios = require('axios');
const {isNumeric} = require('../utils/numberUtils');
const {completeTopUp, completeSubscription} = require('../controllers/users');

const BANQUE_MISR_URL = 'https://banquemisr.gateway.mastercard.com/api/rest/version/82/merchant/TESTCOPTIC/session';
const createPayment = async (req, res) => {
    try {
        const {user: {id: userID}, paymentType, amount} = await req.body;
        const paymentTypeList = ['booking', 'contracting', 'cat1cash', 'cat2cash', 'cat3cash'];
        if (paymentType === undefined || !paymentTypeList.includes(paymentType.toString().toLowerCase())) {
            return res.status(400).json({
                status: "failed",
                error: req.i18n.t('payment.invalidType'),
                message: {}
            })
        }
        if (amount === undefined || !isNumeric(amount)) {
            return res.status(400).json({
                status: "failed",
                error: req.i18n.t('payment.invalidAmount'),
                message: {}
            })
        }
        const uniqueId = generateUUID();
        const itemDescription = req.i18n.t(`item.${paymentType.toString().toLowerCase()}`);

        const username = process.env.PAYMENT_USER_NAME;
        const password = process.env.PAYMENT_PASSWORD;
        const basicAuth = 'Basic ' + btoa(username + ':' + password);
        axios.post(BANQUE_MISR_URL, {
            apiOperation: "INITIATE_CHECKOUT",
            interaction: {
                operation: "PURCHASE",
                merchant: {
                    name: req.i18n.t(`payment.accountName`),
                    logo: process.env.GENERAL_LOGO_LINK
                },
                displayControl: {
                    billingAddress: 'HIDE',
                    shipping: 'HIDE'
                },
                locale: 'ar',
                returnUrl: 'https://dev.copticoffice.com:3000/system/payment-callback'
            },
            order: {
                currency: "EGP",
                amount,
                id: uniqueId,
                description: itemDescription
            }
        }, {headers: {Authorization: basicAuth}})
            .then(async (msg) => {
                if (msg.data.result === 'SUCCESS') {
                    const paymentData = {};
                    paymentData.userID = userID;
                    paymentData.paymentType = paymentType.toString().toLowerCase();
                    paymentData.receiptDetails = {};
                    paymentData.receiptDetails.transactionNumber = uniqueId;
                    paymentData.receiptDetails.items = [];
                    paymentData.receiptDetails.items[0] = {};
                    paymentData.receiptDetails.items[0].name = itemDescription;
                    paymentData.receiptDetails.items[0].price = amount;
                    paymentData.receiptDetails.amount = amount;
                    paymentData.paymentDetails = {};
                    paymentData.receiptDetails.amount = amount;
                    paymentData.paymentDetails.paymentGateway = 'Banque Misr';
                    paymentData.paymentDetails.amount = amount;
                    paymentData.paymentDetails.date = new Date();
                    paymentData.paymentDetails.status = 'Pending';
                    paymentData.paymentDetails.bankSessionId = msg.data.session.id;
                    paymentData.paymentDetails.bankSuccessIndicator = msg.data.successIndicator;

                    await Payment.create(paymentData)
                        .then(() => {
                            res.status(200).json({
                                status: "success",
                                error: "",
                                message: {
                                    sessionId: msg.data.session.id
                                }
                            })
                        })
                        .catch((err) => {
                            res.status(500)
                                .json({
                                    status: "failed",
                                    error: req.i18n.t('payment.creationError'),
                                    message: {
                                        info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
                                    }
                                })
                        })
                }
                else {
                    res.status(400)
                        .json({
                            status: "failed",
                            error: req.i18n.t('payment.bankInitiationError'),
                            message: {
                                info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? msg.error.toString() : undefined
                            }
                        })
                }
            })
            .catch((err) => {
                res.status(400)
                    .json({
                        status: "failed",
                        error: req.i18n.t('payment.bankConnectionError'),
                        message: {
                            info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
                        }
                    })
            })
    }
    catch (err) {
        res.status(500)
            .json({
                status: "failed",
                error: req.i18n.t('general.internalError'),
                message: {
                    info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
                }
            })
    }
}

const completePayment = async (req, res) => {
    try {
        const {transNumber, refNumber} = await req.body;
        await Payment.findOneAndUpdate({'receiptDetails.transactionNumber': transNumber},
            {'paymentDetails.referenceNumber': refNumber, 'paymentDetails.status': 'Succeeded', 'paymentDetails.adviceDate': new Date()},
            {new: true})
            .then(async (payment) => {
                if (!payment) {
                    return res.status(400).json({
                        status: "failed",
                        error: req.i18n.t('payment.invalidTransaction'),
                        message: {}
                    })
                }
                if (payment.paymentType === 'Top up') {
                    const {userID, receiptDetails: {price: {totalAmount, netAmount}}} = payment;
                    await completeTopUp(userID, Number(netAmount), Number(totalAmount) - Number(netAmount))
                        .catch((err) => {
                            errorLog(`Couldn't update top up payment for user ${userID}. Error: ${err}`);
                            return res.status(500).json({})
                        })
                }
                if (payment.paymentType === 'Subscription') {
                    const {userID, paymentDetails: {date: paymentDate}} = payment;
                    await completeSubscription(userID, paymentDate)
                        .catch((err) => {
                            errorLog(`Couldn't update subscription payment for user ${userID}. Error: ${err}`);
                            return res.status(500).json({})
                        })
                }
                res.status(200).json({})
            })
    }
    catch (err) {
        res.status(500)
            .json({
                status: "failed",
                error: req.i18n.t('general.internalError'),
                message: {
                    info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
                }
            })    }
}

module.exports = {createPayment, completePayment}