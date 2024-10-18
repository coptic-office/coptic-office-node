const debug = require('debug');
const errorLog = debug('app-payment:error');
const Payment = require('../models/payments');
const {generateUUID} = require('../utils/codeGenerator');
const axios = require('axios');
const {isNumeric} = require('../utils/numberUtils');
const {completePayment, checkUnitId, checkCategory} = require('../controllers/users');
const {stdout} = require("process");

const BANQUE_MISR_URL = 'https://banquemisr.gateway.mastercard.com/api/rest/version/82/merchant/COPTIC/session';
const createPayment = async (req, res) => {
    try {
        let {user: {id: userID, firstName, lastName, mobile}, paymentType, amount, unitId} = await req.body;
        const paymentTypeList = ['booking', 'contracting', 'cashing'];
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
        if (paymentType !== 'booking' && unitId === undefined) {
            return res.status(400).json({
                status: "failed",
                error: req.i18n.t('payment.invalidUnitId'),
                message: {}
            })
        }
        if (paymentType !== 'booking') {
            const result = await checkUnitId(userID, unitId);
        }
        if (paymentType === 'cashing') {
            const category = await checkCategory(userID, unitId);
        }
        if (unitId === undefined) {
            unitId = '';
        }
        const uniqueId = generateUUID();
        const itemDescription = req.i18n.t(`bankItem.${paymentType.toString().toLowerCase()}`);

        const username = process.env.PAYMENT_USER_NAME;
        const password = process.env.PAYMENT_PASSWORD;
        const failureUrl = process.env.PAYMENT_FAILURE_URL.replace('{{locale}}', req.i18n.t(`general.language`));
        const basicAuth = 'Basic ' + btoa(username + ':' + password);
        axios.post(BANQUE_MISR_URL, {
            apiOperation: "INITIATE_CHECKOUT",
            interaction: {
                operation: "PURCHASE",
                merchant: {
                    name: req.i18n.t(`payment.accountName`),
                    logo: process.env.GENERAL_LOGO_BLACK_LINK
                },
                displayControl: {
                    billingAddress: 'HIDE',
                    shipping: 'HIDE'
                },
                locale: req.i18n.t(`general.language`),
                retryAttemptCount: 3,
                redirectMerchantUrl: failureUrl,
                timeout: 600,
                timeoutUrl: failureUrl,
                cancelUrl: failureUrl,
                returnUrl: process.env.PAYMENT_RETURN_URL
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
                    paymentData.userName = `${firstName} ${lastName}`;
                    paymentData.mobile = mobile;
                    paymentData.unitId = unitId;
                    paymentData.paymentType = paymentType.toString().toLowerCase();
                    paymentData.receiptDetails = {};
                    paymentData.receiptDetails.transactionNumber = uniqueId;
                    paymentData.receiptDetails.items = [];
                    paymentData.receiptDetails.items[0] = {};
                    paymentData.receiptDetails.items[0].name = itemDescription;
                    paymentData.receiptDetails.items[0].price = amount;
                    paymentData.receiptDetails.amount = amount;
                    paymentData.paymentDetails = {};
                    paymentData.paymentDetails.paymentMethod = 'creditCard';
                    paymentData.paymentDetails.locale = req.i18n.t(`general.language`);
                    paymentData.paymentDetails.amount = amount;
                    paymentData.paymentDetails.date = new Date();
                    paymentData.paymentDetails.status = 'Pending';
                    paymentData.paymentDetails.bankSessionId = msg.data.session.id;
                    paymentData.paymentDetails.bankSuccessIndicator = msg.data.successIndicator;
                    paymentData.paymentDetails.comments = 'Payment Gateway: Banque Misr';

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
        if (err.toString() === 'invalidUnitId') {
            res.status(400)
                .json({
                    status: "failed",
                    error: req.i18n.t('payment.invalidUnitId'),
                    message: {}
                })
        }
        else if (err.toString() === 'invalidCategory') {
            res.status(400)
                .json({
                    status: "failed",
                    error: req.i18n.t('payment.invalidCategory'),
                    message: {}
                })
        }
        else {
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
}

const findPayment = (resultIndicator) => {
    return new Promise((myResolve, myReject) => {
        const query = {'paymentDetails.bankSuccessIndicator': resultIndicator};
        const update = {'paymentDetails.status': 'Succeeded', 'paymentDetails.adviceDate': new Date()};
        let locale = 'ar';
        Payment.findOneAndUpdate(query, update, {new: true})
            .then((payment) => {
                if (!payment) {
                    errorLog(`Unmatched resultIndicator: ${resultIndicator}`)
                    myReject({err: 'invalidIndicator', locale});
                }
                else {
                    locale = payment.paymentDetails.locale;
                    const paymentData = {
                        userID: payment.userID,
                        id: payment._id,
                        paymentType: payment.paymentType,
                        paymentMethod: payment.paymentDetails.paymentMethod,
                        locale: payment.paymentDetails.locale,
                        amount: payment.paymentDetails.amount,
                        adviceDate: payment.paymentDetails.adviceDate,
                        unitId: payment.unitId
                    }
                    completePayment(paymentData)
                        .then(() => {
                            myResolve({locale});
                        })
                        .catch((err) => {
                            errorLog(`Failed while completing payment for resultIndicator: ${resultIndicator}\nError: ${err}`);
                            myReject({err: 'completionError', locale});
                        });
                }
            })
            .catch((err) => {
                errorLog(`Failed while processing resultIndicator: ${resultIndicator}\nError: ${err}`);
                myReject({err: 'internalError', locale});
            })
    })
}

const findPaymentByRef = (referenceNumber) => {
    return new Promise((myResolve, myReject) => {
        Payment.findOne({_id: referenceNumber})
            .then((payment) => {
                if (!payment) {
                    return myReject('noPaymentFound');
                }

                myResolve(payment);
            })
            .catch((err) => {
                myReject(err);
            });
    })
}

const addPayment = (paymentData) => {
    return new Promise(async (myResolve, myReject) => {
        const query = {'paymentDetails.paymentMethod': paymentData.paymentDetails.paymentMethod, 'paymentDetails.transactionNumber': paymentData.paymentDetails.transactionNumber};
        Payment.findOne(query, {_id: 1})
            .then(async (foundPayment) => {
                if (!foundPayment) {
                    await Payment.create(paymentData)
                        .then((payment) => {
                            if (!payment) {
                                myReject('creationFailed');
                            } else {
                                myResolve({paymentId: payment._id});
                            }
                        })
                        .catch((err) => {
                            myReject(err);
                        });
                }
                else {
                    myReject('repeatedTransaction');
                }

            })
            .catch((err) => {
                myReject('creationFailed');
            });
    })
}

const updatePayment = (paymentData) => {
    return new Promise((myResolve, myReject) => {
        const {transactionNumber, paymentMethod, userID, userName, mobile, unitId, paymentType, itemDescription, staffID} = paymentData;
        const query = {'paymentDetails.transactionNumber' : transactionNumber, 'paymentDetails.paymentMethod': paymentMethod};
        const projection = {_id: 1, userID: 1, 'receiptDetails.items': 1, 'paymentDetails.amount': 1, 'paymentDetails.adviceDate': 1};

        Payment.findOne(query, projection)
            .then(async (payment) => {
                if (!payment) {
                    return myReject('noPaymentFound');
                }

                if (payment.userID !== undefined) {
                    return myReject('paymentLinked');
                }

                payment.userID = userID;
                payment.userName = userName;
                payment.mobile = mobile;
                payment.unitId = unitId;
                payment.paymentType = paymentType;
                payment.receiptDetails.items[0].name = itemDescription;
                payment.paymentDetails.linkDate = new Date();
                payment.paymentDetails.linkStaffID = staffID;

                await payment.save()
                    .then(() => {
                        myResolve({paymentId: payment._id, amount: payment.paymentDetails.amount, adviceDate: payment.paymentDetails.adviceDate});
                    })
                    .catch((err) => {
                        myReject(err);
                    })

            })
            .catch((err) => {
                myReject(err);
            });
    })
}

module.exports = {createPayment, findPayment, findPaymentByRef, addPayment, updatePayment}
