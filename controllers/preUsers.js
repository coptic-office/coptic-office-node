const debug = require("debug");
const errorLog = debug('app-preUsers:error');
const User = require('../models/users');
const PreUser = require('../models/preUsers');
const numbers = require('../utils/codeGenerator');
const sendSMS = require('../utils/smsConnectors');
const crypto = require('crypto');
const sendEmail = require('../utils/emailSender');
const {createSmsRecord} = require("./smsRecords");

const checkUser = async (req, res) => {
    try {
        const bodyData = await req.body;
        const {mobile, email} = bodyData;
        let mobileNumber = 'None';
        let country = 'None';
        const userIdentifier = process.env.GENERAL_USER_IDENTIFIER;
        const recipient = userIdentifier === 'mobile' ? 'mobileNumber' : 'email'
        if (userIdentifier === 'mobile') {
            if (mobile === undefined) {
                return res.status(400)
                    .json({
                        status: "failed",
                        error: req.i18n.t(`register.mobileRequired`),
                        message: {}
                    })
            }
            else {
                mobileNumber = mobile.number;
                country = mobile.country;
                bodyData['otpReceiver'] = {'recipient': mobileNumber, country};
            }
        }
        if (userIdentifier === 'email') {
            if (email === undefined) {
                return res.status(400)
                    .json({
                        status: "failed",
                        error: req.i18n.t(`register.emailRequired`),
                        message: {}
                    })
            }
            else {
                const regex = new RegExp(/^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/)
                if (regex.test(email)) {
                    bodyData['otpReceiver'] = {'recipient': email};
                }
                else {
                    return res.status(400)
                        .json({
                            status: "failed",
                            error: req.i18n.t(`register.invalidEmail`),
                            message: {}
                        })
                }
            }
        }
        User.findOne(userIdentifier === 'mobile' ? {'mobile.primary.number': mobileNumber} : {'email.primary': email})
            .then(async (user) => {
                if (!user) {
                    PreUser.findOne({'otpReceiver.recipient': bodyData.otpReceiver.recipient})
                        .then(async (preUser) => {
                            if (!preUser) {
                                const otp = numbers.generateNumber(Number(process.env.OTP_DIGITS_NUMBER));
                                bodyData.otp = otp
                                bodyData.action = 'REGISTER'
                                await PreUser.create(bodyData)
                                    .then(async (preUser) => {
                                        if (userIdentifier === 'mobile') {
                                            await sendSMS(otp, mobileNumber, country)
                                                .then(({aggregator, price}) => {
                                                    logSMS(preUser._id, otp, mobileNumber, country, aggregator, price, 'Check User');
                                                    return res.status(201)
                                                        .json({
                                                            status: "success",
                                                            error: "",
                                                            message: {
                                                                mobileNumber,
                                                                isExisted: false,
                                                                otpSent: true,
                                                                info: req.i18n.t('otp.sendingSucceeded', {recipient: mobileNumber}),
                                                                otpResend: preUser.otpResend
                                                            }
                                                        })
                                                })
                                                .catch((err) => {
                                                    preCreationError(req, res, err);
                                                })
                                        }
                                        if (userIdentifier === 'email') {
                                            await sendEmail(req, {
                                                template: 'OTP',
                                                receiver: email,
                                                action: 'REGISTER',
                                                firstName: '',
                                                outro: 'Show',
                                                otp,
                                            })
                                                .then(() => {
                                                    res.status(201)
                                                        .json({
                                                            status: "success",
                                                            error: "",
                                                            message: {
                                                                email,
                                                                isExisted: false,
                                                                otpSent: true,
                                                                info: req.i18n.t('otp.sendingSucceeded', {recipient: email}),
                                                                otpResend: preUser.otpResend
                                                            }
                                                        })
                                                })
                                                .catch((err) => {
                                                    preCreationError(req, res, err);
                                                })
                                        }
                                    })
                                    .catch((err) => {
                                        preCreationError(req, res, err);
                                    })
                            }
                            else {
                                if (new Date() > preUser.otpRenewal) {
                                    const otp = numbers.generateNumber(Number(process.env.OTP_DIGITS_NUMBER));
                                    const renewalInterval = Number(process.env.OTP_RENEWAL_IN_HOURS) * (60 * 60 * 1000);
                                    const smsStartingDelay = Number(process.env.OTP_SMS_STARTING_DELAY);
                                    const emailStartingDelay = Number(process.env.OTP_EMAIL_STARTING_DELAY);
                                    const startingDelay = preUser.otpReceiver.country === 'None' ? emailStartingDelay : smsStartingDelay;
                                    const otpResend = new Date(new Date().getTime() + (startingDelay * 60 * 1000));
                                    await PreUser.updateOne({'otpReceiver.recipient': bodyData.otpReceiver.recipient},
                                        {
                                            otp,
                                            otpDelay: startingDelay,
                                            otpResend,
                                            otpRenewal: new Date(new Date().getTime() + renewalInterval),
                                            wrongTrials: 0,
                                            action: 'REGISTER'
                                        })
                                        .then(async () => {
                                            if (userIdentifier === 'mobile') {
                                                await sendSMS(otp, mobileNumber, country)
                                                    .then(({aggregator, price}) => {
                                                        logSMS(preUser._id, otp, mobileNumber, country, aggregator, price, 'Check User');
                                                        res.status(205)
                                                            .json({
                                                                status: "success",
                                                                error: "",
                                                                message: {
                                                                    mobileNumber,
                                                                    isExisted: false,
                                                                    otpSent: true,
                                                                    info: req.i18n.t('otp.sendingSucceeded', {recipient: mobileNumber}),
                                                                    otpResend
                                                                }
                                                            })
                                                    })
                                                    .catch((err) => {
                                                        preCreationError(req, res, err);
                                                    })
                                            }
                                            if (userIdentifier === 'email') {
                                                await sendEmail(req, {
                                                    template: 'OTP',
                                                    receiver: email,
                                                    action: 'REGISTER',
                                                    firstName: '',
                                                    outro: 'Show',
                                                    otp,
                                                })
                                                    .then(() => {
                                                        res.status(205)
                                                            .json({
                                                                status: "success",
                                                                error: "",
                                                                message: {
                                                                    email,
                                                                    isExisted: false,
                                                                    otpSent: true,
                                                                    info: req.i18n.t('otp.sendingSucceeded', {recipient: email}),
                                                                    otpResend
                                                                }
                                                            })
                                                    })
                                                    .catch((err) => {
                                                        preCreationError(req, res, err);
                                                    })
                                            }
                                        })
                                        .catch((err) => {
                                            preCreationError(req, res, err);
                                        })
                                }
                                else {
                                    if (preUser.wrongTrials >= Number(process.env.OTP_MAX_WRONG_TRIALS)) {
                                        res.status(403)
                                            .json({
                                                status: "success",
                                                error: "",
                                                message: {
                                                    [recipient]: preUser.otpReceiver.recipient,
                                                    isExisted: false,
                                                    otpSent: false,
                                                    info: userIdentifier === 'mobile' ? req.i18n.t('user.mobileUsageSuspended') : req.i18n.t('user.emailUsageSuspended'),
                                                    otpResend: preUser.otpRenewal
                                                }
                                            })
                                    }
                                    else {
                                        if (new Date() > preUser.otpResend) {
                                            const otp = preUser.otp;
                                            const smsDelayMultiplier = Number(process.env.OTP_SMS_DELAY_MULTIPLIER);
                                            const emailDelayMultiplier = Number(process.env.OTP_EMAIL_DELAY_MULTIPLIER);
                                            const delayMultiplier = preUser.otpReceiver.country === 'None' ? emailDelayMultiplier : smsDelayMultiplier;
                                            const otpDelay = preUser.otpDelay * delayMultiplier;
                                            const otpResend = new Date(new Date().getTime() + (otpDelay * 60 * 1000));
                                            await PreUser.updateOne({'otpReceiver.recipient': bodyData.otpReceiver.recipient},
                                                {
                                                    otpDelay,
                                                    otpResend,
                                                    action: 'REGISTER'
                                                })
                                                .then(async () => {
                                                    if (userIdentifier === 'mobile') {
                                                        await sendSMS(otp, mobileNumber, country)
                                                            .then(({aggregator, price}) => {
                                                                logSMS(preUser._id, otp, mobileNumber, country, aggregator, price, 'Check User');
                                                                res.status(205)
                                                                    .json({
                                                                        status: "success",
                                                                        error: "",
                                                                        message: {
                                                                            mobileNumber,
                                                                            isExisted: false,
                                                                            otpSent: true,
                                                                            info: req.i18n.t('otp.sendingSucceeded', {recipient: mobileNumber}),
                                                                            otpResend
                                                                        }
                                                                    })
                                                            })
                                                            .catch((err) => {
                                                                preCreationError(req, res, err);
                                                            })
                                                    }
                                                    if (userIdentifier === 'email') {
                                                        await sendEmail(req, {
                                                            template: 'OTP',
                                                            receiver: email,
                                                            action: 'REGISTER',
                                                            firstName: '',
                                                            outro: 'Show',
                                                            otp,
                                                        })
                                                            .then(() => {
                                                                res.status(205)
                                                                    .json({
                                                                        status: "success",
                                                                        error: "",
                                                                        message: {
                                                                            email,
                                                                            isExisted: false,
                                                                            otpSent: true,
                                                                            info: req.i18n.t('otp.sendingSucceeded', {recipient: email}),
                                                                            otpResend
                                                                        }
                                                                    })
                                                            })
                                                            .catch((err) => {
                                                                preCreationError(req, res, err);
                                                            })
                                                    }
                                                })
                                                .catch((err) => {
                                                    preCreationError(req, res, err);
                                                })
                                        }
                                        else {
                                            res.status(401)
                                                .json({
                                                    status: "success",
                                                    error: "",
                                                    message: {
                                                        [recipient]: bodyData.otpReceiver.recipient,
                                                        isExisted: false,
                                                        otpSent: false,
                                                        info: userIdentifier === 'mobile' ? req.i18n.t('user.mobileUsageSuspended') : req.i18n.t('user.emailUsageSuspended'),
                                                        otpResend: preUser.otpResend
                                                    }
                                                })
                                        }
                                    }
                                }
                            }
                        })
                        .catch((err) => {
                            internalError(req, res, err);
                        })
                }
                else {
                    res.status(200)
                        .json({
                            status: "success",
                            error: "",
                            message: {
                                [recipient]: bodyData.otpReceiver.recipient,
                                isExisted: true,
                            }
                        })
                }
            })
            .catch((err) => {
                internalError(req, res, err);
            })
    }
    catch (err) {
        internalError(req, res, err);
    }
}

const verifyOTP = async (req, res) => {
    try {
        const {mobileNumber, email, otp, user} = await req.body;
        let receiver = 'None';
        let recipient = 'None';
        if (mobileNumber !== undefined) {
            receiver = mobileNumber;
            recipient = 'mobileNumber';
        }
        if (email !== undefined) {
            receiver = email;
            recipient = 'email';
        }
        PreUser.findOne({'otpReceiver.recipient': receiver})
            .then(async (preUser) => {
                if (!preUser) {
                    res.status(404)
                        .json({
                            status: "failed",
                            error: req.i18n.t('otp.recipientNotFound'),
                            message: {}
                        })
                }
                else {
                    if (preUser.wrongTrials >= Number(process.env.OTP_MAX_WRONG_TRIALS)) {
                        res.status(403)
                            .json({
                                status: "failed",
                                error: req.i18n.t('otp.verificationSuspended'),
                                message: {
                                    otpResend: preUser.otpRenewal
                                }
                            })
                    }
                    else {
                        if (preUser.otp !== otp) {
                            const wrongTrials = preUser.wrongTrials + 1
                            await PreUser.updateOne({'otpReceiver.recipient': receiver}, {wrongTrials})
                            res.status(401)
                                .json({
                                    status: "failed",
                                    error: req.i18n.t('otp.incorrectOTP'),
                                    message: {}
                                })
                        }
                        else {
                            if (preUser.action === 'REGISTER' || preUser.action === 'PASSWORD') {
                                const verificationCode = crypto.randomBytes(30).toString('hex');
                                await PreUser.updateOne({'otpReceiver.recipient': receiver}, {verificationCode})
                                res.status(205)
                                    .json({
                                        status: "success",
                                        error: "",
                                        message: {
                                            [recipient]: receiver,
                                            verificationCode
                                        }
                                    })
                            }
                            else {
                                eval(preUser.callback)(req, res, user.id);
                            }
                        }
                    }
                }
            })
            .catch((err) => {
                internalError(req, res, err);
            })
    }
    catch (err) {
        internalError(req, res, err);
    }
}

const resendOTP = async (req, res) => {
    try {
        const {mobileNumber, email, user} = await req.body;
        let receiver = 'None';
        let messageType = 'None';
        if (mobileNumber !== undefined) {
            receiver = mobileNumber;
            messageType = 'mobile';
        }
        if (email !== undefined) {
            receiver = email;
            messageType = 'email';
        }
        PreUser.findOne({'otpReceiver.recipient': receiver})
            .then(async (preUser) => {
                if (!preUser) {
                    res.status(404)
                        .json({
                            status: "failed",
                            error: req.i18n.t('otp.recipientNotFound'),
                            message: {}
                        })
                } else {
                    if (new Date() > preUser.otpRenewal) {
                        const otp = numbers.generateNumber(Number(process.env.OTP_DIGITS_NUMBER));
                        const renewalInterval = Number(process.env.OTP_RENEWAL_IN_HOURS) * (60 * 60 * 1000);
                        const smsStartingDelay = Number(process.env.OTP_SMS_STARTING_DELAY);
                        const emailStartingDelay = Number(process.env.OTP_EMAIL_STARTING_DELAY);
                        const startingDelay = preUser.otpReceiver.country === 'None' ? emailStartingDelay : smsStartingDelay;
                        const otpResend = new Date(new Date().getTime() + (startingDelay * 60 * 1000));
                        await PreUser.updateOne({'otpReceiver.recipient': receiver},
                            {
                                otp,
                                otpDelay: startingDelay,
                                otpResend,
                                otpRenewal: new Date(new Date().getTime() + renewalInterval),
                                wrongTrials: 0
                            })
                            .then(async () => {
                                if (messageType === 'mobile') {
                                    const country = preUser.otpReceiver.country;
                                    await sendSMS(otp, mobileNumber, country)
                                        .then(({aggregator, price}) => {
                                            logSMS(preUser._id, otp, mobileNumber, country, aggregator, price, 'Resend OTP');
                                            res.status(205)
                                                .json({
                                                    status: "success",
                                                    error: "",
                                                    message: {
                                                        mobile: receiver,
                                                        otpSent: true,
                                                        info: req.i18n.t('otp.sendingSucceeded', {recipient: receiver}),
                                                        otpResend
                                                    }
                                                })
                                        })
                                        .catch((err) => {
                                            otpSendingError(req, res, err);
                                        })
                                }
                                if (messageType === 'email') {
                                    await sendEmail(req, {
                                        template: 'OTP',
                                        receiver: email,
                                        action: preUser.action,
                                        firstName: user.role !== 'Guest' ? user.firstName : '',
                                        outro: user.role !== 'Guest' ? 'Hide' : 'Show',
                                        otp,
                                    })
                                        .then(() => {
                                            res.status(205)
                                                .json({
                                                    status: "success",
                                                    error: "",
                                                    message: {
                                                        email: receiver,
                                                        otpSent: true,
                                                        info: req.i18n.t('otp.sendingSucceeded', {recipient: receiver}),
                                                        otpResend
                                                    }
                                                })
                                        })
                                        .catch((err) => {
                                            otpSendingError(req, res, err);

                                        })
                                }
                            })
                            .catch((err) => {
                                otpSendingError(req, res, err);

                            })
                    }
                    else {
                        if (preUser.wrongTrials >= Number(process.env.OTP_MAX_WRONG_TRIALS)) {
                            res.status(403)
                                .json({
                                    status: "failed",
                                    error: req.i18n.t('otp.trialsSuspended'),
                                    message: {
                                        otpResend: preUser.otpRenewal
                                    }
                                })
                        }
                        else {
                            if (new Date() > preUser.otpResend) {
                                const otp = preUser.otp;
                                const smsDelayMultiplier = Number(process.env.OTP_SMS_DELAY_MULTIPLIER);
                                const emailDelayMultiplier = Number(process.env.OTP_EMAIL_DELAY_MULTIPLIER);
                                const delayMultiplier = preUser.otpReceiver.country === 'None' ? emailDelayMultiplier : smsDelayMultiplier;
                                const otpDelay = preUser.otpDelay * delayMultiplier;
                                const otpResend = new Date(new Date().getTime() + (otpDelay * 60 * 1000));
                                await PreUser.updateOne({'otpReceiver.recipient': receiver},
                                    {
                                        otpDelay,
                                        otpResend,
                                    })
                                    .then(async () => {
                                        if (messageType === 'mobile') {
                                            const country = preUser.otpReceiver.country;
                                            await sendSMS(otp, mobileNumber, country)
                                                .then(({aggregator, price}) => {
                                                    logSMS(preUser._id, otp, mobileNumber, country, aggregator, price, 'Resend OTP');
                                                    res.status(205)
                                                        .json({
                                                            status: "success",
                                                            error: "",
                                                            message: {
                                                                mobile: receiver,
                                                                otpSent: true,
                                                                info: req.i18n.t('otp.sendingSucceeded', {recipient: receiver}),
                                                                otpResend
                                                            }
                                                        })
                                                })
                                                .catch((err) => {
                                                    otpSendingError(req, res, err);

                                                })
                                        }
                                        if (messageType === 'email') {
                                            await sendEmail(req, {
                                                template: 'OTP',
                                                receiver: email,
                                                action: preUser.action,
                                                firstName: user.role !== 'Guest' ? user.firstName : '',
                                                outro: user.role !== 'Guest' ? 'Hide' : 'Show',
                                                otp,
                                            })
                                                .then(() => {
                                                    res.status(205)
                                                        .json({
                                                            status: "success",
                                                            error: "",
                                                            message: {
                                                                email: receiver,
                                                                otpSent: true,
                                                                info: req.i18n.t('otp.sendingSucceeded', {recipient: receiver}),
                                                                otpResend
                                                            }
                                                        })
                                                })
                                                .catch((err) => {
                                                    otpSendingError(req, res, err);

                                                })
                                        }
                                    })
                                    .catch((err) => {
                                        otpSendingError(req, res, err);

                                    })
                            }
                            else {
                                res.status(401)
                                    .json({
                                        status: "failed",
                                        error: req.i18n.t('otp.sendingSuspended'),
                                        message: {otpResend: preUser.otpResend}
                                    })
                            }
                        }
                    }
                }
            })
            .catch((err) => {
                internalError(req, res, err);
            })
    }
    catch (err) {
        internalError(req, res, err);
    }
}

const forgotPassword = async (req, res) => {
    try {
        const bodyData = await req.body;
        const {mobile, email} = bodyData;
        let mobileNumber = 'None';
        let country = 'None';
        let userIdentifier = 'None';

        if (mobile !== undefined) {
            userIdentifier = 'mobile'
            mobileNumber = mobile.number;
            country = mobile.country;
            bodyData['otpReceiver'] = {'recipient': mobileNumber, country};
        }
        if (email !== undefined) {
            userIdentifier = 'email'
            const regex = new RegExp(/^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/)
            if (regex.test(email)) {
                bodyData['otpReceiver'] = {'recipient': email};
            }
            else {
                return res.status(400)
                    .json({
                        status: "failed",
                        error: req.i18n.t(`register.invalidEmail`),
                        message: {}
                    })
            }
        }
        const recipient = userIdentifier === 'mobile' ? 'mobileNumber' : 'email'

        User.findOne(userIdentifier === 'mobile' ?
            {$and: [{'mobile.primary.number': mobileNumber}, {'mobile.isVerified': true}]} :
            {$and: [{'email.primary': email}, {'email.isVerified': true}]})
            .then(async (user) => {
                if (user) {
                    PreUser.findOne({'otpReceiver.recipient': bodyData.otpReceiver.recipient})
                        .then(async (preUser) => {
                            if (!preUser) {
                                const otp = numbers.generateNumber(Number(process.env.OTP_DIGITS_NUMBER));
                                bodyData.otp = otp
                                bodyData.action = 'PASSWORD'
                                await PreUser.create(bodyData)
                                    .then(async (preUser) => {
                                        if (userIdentifier === 'mobile') {
                                            await sendSMS(otp, mobileNumber, country)
                                                .then(({aggregator, price}) => {
                                                    logSMS(preUser._id, otp, mobileNumber, country, aggregator, price, 'Forgot Password');
                                                    return res.status(201)
                                                        .json({
                                                            status: "success",
                                                            error: "",
                                                            message: {
                                                                mobileNumber,
                                                                otpSent: true,
                                                                info: req.i18n.t('otp.sendingSucceeded', {recipient: mobileNumber}),
                                                                otpResend: preUser.otpResend
                                                            }
                                                        })
                                                })
                                                .catch((err) => {
                                                    forgotPasswordError(req, res, err);
                                                })
                                        }
                                        if (userIdentifier === 'email') {
                                            await sendEmail(req, {
                                                template: 'OTP',
                                                receiver: email,
                                                action: 'PASSWORD',
                                                firstName: '',
                                                outro: 'Show',
                                                otp,
                                            })
                                                .then(() => {
                                                    res.status(201)
                                                        .json({
                                                            status: "success",
                                                            error: "",
                                                            message: {
                                                                email,
                                                                otpSent: true,
                                                                info: req.i18n.t('otp.sendingSucceeded', {recipient: email}),
                                                                otpResend: preUser.otpResend
                                                            }
                                                        })
                                                })
                                                .catch((err) => {
                                                    forgotPasswordError(req, res, err);
                                                })
                                        }
                                    })
                                    .catch((err) => {
                                        forgotPasswordError(req, res, err);
                                    })
                            }
                            else {
                                if (new Date() > preUser.otpRenewal) {
                                    const otp = numbers.generateNumber(Number(process.env.OTP_DIGITS_NUMBER));
                                    const renewalInterval = Number(process.env.OTP_RENEWAL_IN_HOURS) * (60 * 60 * 1000);
                                    const smsStartingDelay = Number(process.env.OTP_SMS_STARTING_DELAY);
                                    const emailStartingDelay = Number(process.env.OTP_EMAIL_STARTING_DELAY);
                                    const startingDelay = preUser.otpReceiver.country === 'None' ? emailStartingDelay : smsStartingDelay;
                                    const otpResend = new Date(new Date().getTime() + (startingDelay * 60 * 1000));
                                    await PreUser.updateOne({'otpReceiver.recipient': bodyData.otpReceiver.recipient},
                                        {
                                            otp,
                                            otpDelay: startingDelay,
                                            otpResend,
                                            otpRenewal: new Date(new Date().getTime() + renewalInterval),
                                            wrongTrials: 0,
                                            action: 'PASSWORD'
                                        })
                                        .then(async () => {
                                            if (userIdentifier === 'mobile') {
                                                await sendSMS(otp, mobileNumber, country)
                                                    .then(({aggregator, price}) => {
                                                        logSMS(preUser._id, otp, mobileNumber, country, aggregator, price, 'Forgot Password');
                                                        res.status(205)
                                                            .json({
                                                                status: "success",
                                                                error: "",
                                                                message: {
                                                                    mobileNumber,
                                                                    otpSent: true,
                                                                    info: req.i18n.t('otp.sendingSucceeded', {recipient: mobileNumber}),
                                                                    otpResend
                                                                }
                                                            })
                                                    })
                                                    .catch((err) => {
                                                        forgotPasswordError(req, res, err);
                                                    })
                                            }
                                            if (userIdentifier === 'email') {
                                                await sendEmail(req, {
                                                    template: 'OTP',
                                                    receiver: email,
                                                    action: 'PASSWORD',
                                                    firstName: '',
                                                    outro: 'Show',
                                                    otp,
                                                })
                                                    .then(() => {
                                                        res.status(205)
                                                            .json({
                                                                status: "success",
                                                                error: "",
                                                                message: {
                                                                    email,
                                                                    otpSent: true,
                                                                    info: req.i18n.t('otp.sendingSucceeded', {recipient: email}),
                                                                    otpResend
                                                                }
                                                            })
                                                    })
                                                    .catch((err) => {
                                                        forgotPasswordError(req, res, err);
                                                    })
                                            }
                                        })
                                        .catch((err) => {
                                            forgotPasswordError(req, res, err);
                                        })
                                }
                                else {
                                    if (preUser.wrongTrials >= Number(process.env.OTP_MAX_WRONG_TRIALS)) {
                                        res.status(403)
                                            .json({
                                                status: "success",
                                                error: "",
                                                message: {
                                                    [recipient]: preUser.otpReceiver.recipient,
                                                    otpSent: false,
                                                    info: userIdentifier === 'mobile' ? req.i18n.t('user.mobileUsageSuspended') : req.i18n.t('user.emailUsageSuspended'),
                                                    otpResend: preUser.otpRenewal
                                                }
                                            })
                                    }
                                    else {
                                        if (new Date() > preUser.otpResend) {
                                            const otp = preUser.otp;
                                            const smsDelayMultiplier = Number(process.env.OTP_SMS_DELAY_MULTIPLIER);
                                            const emailDelayMultiplier = Number(process.env.OTP_EMAIL_DELAY_MULTIPLIER);
                                            const delayMultiplier = preUser.otpReceiver.country === 'None' ? emailDelayMultiplier : smsDelayMultiplier;
                                            const otpDelay = preUser.otpDelay * delayMultiplier;
                                            const otpResend = new Date(new Date().getTime() + (otpDelay * 60 * 1000));
                                            await PreUser.updateOne({'otpReceiver.recipient': bodyData.otpReceiver.recipient},
                                                {
                                                    otpDelay,
                                                    otpResend,
                                                    action: 'PASSWORD'
                                                })
                                                .then(async () => {
                                                    if (userIdentifier === 'mobile') {
                                                        await sendSMS(otp, mobileNumber, country)
                                                            .then(({aggregator, price}) => {
                                                                logSMS(preUser._id, otp, mobileNumber, country, aggregator, price, 'Forgot Password');
                                                                res.status(205)
                                                                    .json({
                                                                        status: "success",
                                                                        error: "",
                                                                        message: {
                                                                            mobileNumber,
                                                                            otpSent: true,
                                                                            info: req.i18n.t('otp.sendingSucceeded', {recipient: mobileNumber}),
                                                                            otpResend
                                                                        }
                                                                    })
                                                            })
                                                            .catch((err) => {
                                                                forgotPasswordError(req, res, err);
                                                            })
                                                    }
                                                    if (userIdentifier === 'email') {
                                                        await sendEmail(req, {
                                                            template: 'OTP',
                                                            receiver: email,
                                                            action: 'PASSWORD',
                                                            firstName: '',
                                                            outro: 'Show',
                                                            otp,
                                                        })
                                                            .then(() => {
                                                                res.status(205)
                                                                    .json({
                                                                        status: "success",
                                                                        error: "",
                                                                        message: {
                                                                            email,
                                                                            otpSent: true,
                                                                            info: req.i18n.t('otp.sendingSucceeded', {recipient: email}),
                                                                            otpResend
                                                                        }
                                                                    })
                                                            })
                                                            .catch((err) => {
                                                                forgotPasswordError(req, res, err);
                                                            })
                                                    }
                                                })
                                                .catch((err) => {
                                                    forgotPasswordError(req, res, err);
                                                })
                                        }
                                        else {
                                            res.status(401)
                                                .json({
                                                    status: "success",
                                                    error: "",
                                                    message: {
                                                        [recipient]: bodyData.otpReceiver.recipient,
                                                        otpSent: false,
                                                        info: userIdentifier === 'mobile' ? req.i18n.t('user.mobileUsageSuspended') : req.i18n.t('user.emailUsageSuspended'),
                                                        otpResend: preUser.otpResend
                                                    }
                                                })
                                        }
                                    }
                                }
                            }
                        })
                        .catch((err) => {
                            internalError(req, res, err);
                        })
                }
                else {
                    res.status(404)
                        .json({
                            status: "failed",
                            error: req.i18n.t('login.userNotFound'),
                            message: {}
                        })
                }
            })
            .catch((err) => {
                internalError(req, res, err);
            })
    }
    catch (err) {
        internalError(req, res, err);
    }
}

const logSMS = (userID, message, mobileNumber, country, aggregator, price, comment) => {
    const smsRecord = {
        userID,
        message,
        mobile: {country, number: mobileNumber},
        aggregator,
        status: 'Succeeded',
        errorReason: '',
        costPrice: price,
        sellingPrice: 0,
        'paidPrice.system': price,
        plan: 'System',
        comment,
        date: new Date()
    }
    createSmsRecord(smsRecord)
        .catch((err) => {
            errorLog(`Couldn't log SMS Record. ${err.toString()}`);
            errorLog(smsRecord);
        })
}

const preCreationError = (req, res, err) => {
    res.status(404)
        .json({
            status: "failed",
            error: req.i18n.t('register.preCreationError'),
            message: {
                info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
            }
        })
}

const forgotPasswordError = (req, res, err) => {
    res.status(404)
        .json({
            status: "failed",
            error: req.i18n.t('user.forgotPasswordError'),
            message: {
                info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
            }
        })
}

const otpSendingError = (req, res, err) => {
    res.status(404)
        .json({
            status: "failed",
            error: req.i18n.t('otp.sendingError'),
            message: {}
        })
}

const internalError = (req, res, err) => {
    res.status(500)
        .json({
            status: "failed",
            error: req.i18n.t('general.internalError'),
            message: {
                info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
            }
        })
}

module.exports = {checkUser, verifyOTP, resendOTP, forgotPassword};