const debug = require('debug');
const errorLog = debug('app-payment:error');
const Payment = require('../models/payments');
const {generateUUID} = require('../utils/codeGenerator');
const {validateCoupon} = require('../controllers/coupons');
const {getUserById, completeTopUp, completeSubscription} = require('../controllers/users');

const createPayment = async (req, res) => {
    try {
        const {user: {id: userID}, paymentType, price} = await req.body;
        const {totalAmount, netAmount, coupon} = price !== undefined ? price : {};
        if (paymentType === undefined || !['TOP UP', 'SUBSCRIPTION'].includes(paymentType.toString().toUpperCase())) {
            return res.status(400).json({
                status: "failed",
                error: req.i18n.t('payment.invalidType'),
                message: {}
            })
        }
        if (price === undefined || totalAmount === undefined || netAmount === undefined
            || typeof totalAmount !== 'number' || typeof netAmount !== 'number' || netAmount > totalAmount) {
            return res.status(400).json({
                status: "failed",
                error: req.i18n.t('payment.invalidPrice'),
                message: {}
            })
        }
        if (netAmount < totalAmount && (coupon === undefined || coupon === '')) {
            return res.status(400).json({
                status: "failed",
                error: req.i18n.t('payment.missingCoupon'),
                message: {}
            })
        }
        if (netAmount < totalAmount) {
            const discountAmount = await validateCoupon(coupon, userID, totalAmount);
            if (Number(totalAmount) !== Number(netAmount) + Number(discountAmount)) {
                return res.status(400).json({
                    status: "failed",
                    error: req.i18n.t('coupon.incorrectDiscount'),
                    message: {}
                })
            }
        }
        const paymentData = {};
        paymentData.receiptDetails = {};
        paymentData.paymentDetails = {};
        paymentData.receiptDetails.price = {};
        paymentData.receiptDetails.items = [];
        paymentData.userID = userID;
        paymentData.receiptDetails.transactionNumber = generateUUID();
        paymentData.receiptDetails.price.totalAmount = totalAmount;
        paymentData.receiptDetails.price.netAmount = netAmount;
        paymentData.receiptDetails.price.coupon = coupon !== undefined ? coupon : '---';
        paymentData.paymentDetails.paymentGateway = 'Amazon';
        paymentData.paymentDetails.amount = netAmount;
        paymentData.paymentDetails.date = new Date();
        paymentData.paymentDetails.status = 'Pending';
        if (paymentType.toString().toUpperCase() === 'TOP UP') {
            paymentData.paymentType = 'Top up';
            paymentData.receiptDetails.items[0] = {};
            paymentData.receiptDetails.items[0].name = 'PAYG';
            paymentData.receiptDetails.items[0].price = totalAmount;
        }
        if (paymentType.toString().toUpperCase() === 'SUBSCRIPTION') {
            const payment = await Payment.find({userID, paymentType: 'Subscription'}).sort({'paymentDetails.date': -1}).limit(1);
            if (payment.length !== 0 && payment[0].paymentDetails.status === 'Pending') {
                return res.status(403).json({
                    status: "failed",
                    error: req.i18n.t('payment.pendingSubscription'),
                    message: {}
                })
            }
            let calculatedAmount = 0.0;
            const {subscription: {savingPlan: {renewal}, services}} = await getUserById(userID, {subscription: 1});
            paymentData.paymentType = 'Subscription';
            let i = 0;
            if (JSON.stringify(renewal) !== '{}' && renewal.action === 'Renew') {
                paymentData.receiptDetails.items[i] = {};
                paymentData.receiptDetails.items[i].name = renewal.nextSavingPlan;
                paymentData.receiptDetails.items[i].price = renewal.price;
                calculatedAmount += Number(renewal.price);
                i++;
            }
            for (const service of services) {
                if (service.renewal.action === 'Renew') {
                    paymentData.receiptDetails.items[i] = {};
                    paymentData.receiptDetails.items[i].name = service.name;
                    paymentData.receiptDetails.items[i].price = service.price;
                    calculatedAmount += Number(service.price);
                    i++;
                }
            }
            if (totalAmount !== calculatedAmount) {
                return res.status(400).json({
                    status: "failed",
                    error: req.i18n.t('payment.incorrectAmount'),
                    message: {}
                })
            }
        }
        await Payment.create(paymentData)
            .then(() => {
                res.status(200).json({
                    status: "success",
                    error: "",
                    message: {
                        paymentData
                    }
                })
            })
    }
    catch (err) {
        if (['invalidCoupon', 'usedCoupon'].includes(err)) {
            res.status(400)
                .json({
                    status: "failed",
                    error: req.i18n.t(`coupon.${err}`),
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