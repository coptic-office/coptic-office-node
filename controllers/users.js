const debug = require('debug');
const errorLog = debug('app-users:error');
const User = require('../models/users');
const PreUser = require('../models/preUsers');
const auth = require('../middleware/auth');
const numbers = require("../utils/codeGenerator");
const sendEmail = require("../utils/emailSender");
const sendSMS = require("../utils/smsConnectors");
const {getCountry} = require('../controllers/countries');
const Token = require("../models/tokens");
const {getPlanPrice} = require('../controllers/plans');
const {getServiceData} = require('../controllers/services');
const Payment = require('../models/payments')
const {createSmsRecord} = require("./smsRecords");
const crypto = require('../utils/crypto');
const {getSellingPrice} = require("./plans");
const Unit = require('../models/units');

const createUser = async (req, res) => {
    try {
        const bodyData = await req.body;
        const {mobile, mobileNumber, email} = bodyData;
        const userIdentifier = process.env.GENERAL_USER_IDENTIFIER;
        let identifier = 'None';
        if (userIdentifier === 'mobile') {
            if (mobileNumber === undefined) {
                return res.status(400)
                    .json({
                        status: "failed",
                        error: req.i18n.t(`register.mobileRequired`),
                        message: {}
                    })
            }
            else {
                identifier = mobileNumber;
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
                identifier = email;
            }
        }
        PreUser.findOne({'otpReceiver.recipient': identifier})
            .then(async (preUser) => {
                if (!preUser) {
                    res.status(401)
                        .json({
                            status: "failed",
                            error: req.i18n.t('user.noPreUser'),
                            message: {}
                        })
                }
                else {
                    if (bodyData.verificationCode === preUser.verificationCode) {

                        bodyData['mobile'] = {};
                        let {country} = preUser.otpReceiver;
                        if (country === 'None') {
                            if (mobile !== undefined) {
                                country = mobile.country;
                                bodyData.mobile['primary'] = {'number': mobile.number, country};
                                bodyData.mobile['isVerified'] = false;
                            }
                        }
                        else {
                            bodyData.mobile['primary'] = {'number': mobileNumber, country};
                            bodyData.mobile['isVerified'] = true;
                        }

                        if (country !== 'None') {
                            const targetCountry = await getCountry({name: country})
                                .catch((err) => {

                                })
                            if (targetCountry) {
                                bodyData.currency = targetCountry.currency;
                            }
                        }

                        if (email !== undefined) {
                            bodyData['email'] = {};
                            bodyData.email['primary'] = email;
                            bodyData.email['isVerified'] = userIdentifier === 'email';
                        }

                        await User.create(bodyData)
                            .then(async (user) => {
                                if (!user) {
                                    return res.status(404)
                                        .json({
                                            status: "failed",
                                            error: req.i18n.t('register.creationError')
                                        })
                                }
                                await preUser.deleteOne()
                                const accessToken = auth.issueAccessToken(user)
                                if (accessToken === 'Error') {
                                    return res.status(500)
                                        .json({
                                            status: "failed",
                                            error: req.i18n.t('security.signingError'),
                                            message: {}
                                        })
                                }
                                const renewToken = await auth.issueRenewToken(user)
                                    .catch((err) => {
                                        return res.status(500)
                                            .json({
                                                status: "failed",
                                                error: req.i18n.t('security.signingError'),
                                                message: {}
                                            })
                                    })

                                user = {
                                    ...user._doc, _id: undefined, __v: undefined, password: undefined,
                                    currency: undefined, email: undefined, payments: undefined, units: undefined,
                                    plan: undefined, balance: undefined, courtesy: undefined, subscription: undefined,
                                    coupons: undefined, role: undefined, isActive: undefined
                                };

                                res.status(201)
                                    .json({
                                        status: "success",
                                        error: "",
                                        message: {
                                            user,
                                            accessToken,
                                            renewToken
                                        }
                                    })
                            })
                            .catch((err) => {
                                let resourceID = ''
                                if (typeof err.errors.firstName != 'undefined') {
                                    resourceID = err.errors.firstName.message;
                                } else if (typeof err.errors.lastName != 'undefined') {
                                    resourceID = err.errors.lastName.message;
                                } else if (typeof err.errors['email.primary'] != 'undefined') {
                                    resourceID = err.errors['email.primary'].message;
                                } else if (typeof err.errors.password != 'undefined') {
                                    resourceID = err.errors.password.message;
                                } else if (typeof err.errors.role != 'undefined') {
                                    resourceID = err.errors.role.message;
                                }
                                res.status(400)
                                    .json({
                                        status: "failed",
                                        error: req.i18n.t(`register.${resourceID}`),
                                        message: {}
                                    })
                            })
                    }
                    else {
                        res.status(401)
                            .json({
                                status: "failed",
                                error: req.i18n.t('user.incorrectPreUser'),
                                message: {}
                            })
                    }
                }
            })
            .catch((err) => {
                res.status(500)
                    .json({
                        status: "failed",
                        error: req.i18n.t('general.internalError'),
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

const login = async (req, res) => {
    try {
        const {mobileNumber, email, password} = await req.body;
        const userIdentifier = process.env.GENERAL_USER_IDENTIFIER;
        if (userIdentifier === 'mobile') {
            if (mobileNumber === undefined) {
                return res.status(400)
                    .json({
                        status: "failed",
                        error: req.i18n.t(`register.mobileRequired`),
                        message: {}
                    })
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
        }
        const query = userIdentifier === 'mobile' ? {'mobile.primary.number': mobileNumber} : {'email.primary': email};
        const projection = {firstName: 1, lastName: 1, password: 1, mobile: 1, role: 1, isActive: 1}
        User.findOne(query, projection)
            .then((user) => {
                if (!user) {
                    return res.status(404)
                        .json({
                            status: "failed",
                            error: req.i18n.t('login.userNotFound'),
                            message: {}
                        })
                }
                let {isSuspended, login: {failedTrials, nextTrial}} = user.isActive;
                if (isSuspended) {
                    return res.status(403).json({
                        status: "failed",
                        error: req.i18n.t('restriction.suspended'),
                        message: {}
                    })
                }
                if (new Date() < new Date(nextTrial)) {
                    return res.status(403).json({
                        status: "failed",
                        error: req.i18n.t('restriction.locked'),
                        message: {
                            nextTrial
                        }
                    })
                }
                user.comparePassword(password, async (err, isMatch) => {
                    if (err) {
                        return res.status(500)
                            .json({
                                status: "failed",
                                error: req.i18n.t('login.loginError'),
                                message: {}
                            })
                    }
                    if (isMatch) {
                        if (failedTrials > 0) {
                            updateRestriction(user._id, {failedTrials: 0})
                                .catch((err) => {
                                    errorLog(`Couldn't update user restriction for user: ${user._id}. ${err.toString()}`);
                                })
                        }
                        const accessToken = auth.issueAccessToken(user);
                        if (accessToken === 'Error') {
                            return res.status(500)
                                .json({
                                    status: "failed",
                                    error: req.i18n.t('security.signingError'),
                                    message: {}
                                })
                        }
                        const renewToken = await auth.issueRenewToken(user)
                            .catch((err) => {
                                return res.status(500)
                                    .json({
                                        status: "failed",
                                        error: req.i18n.t('security.signingError'),
                                        message: {}
                                    })
                            })

                        user = {...user._doc,_id: undefined, __v: undefined, password: undefined, role: undefined, isActive: undefined};

                        res.status(200)
                            .json({
                                status: "success",
                                error: "",
                                message: {
                                    user,
                                    accessToken,
                                    renewToken
                                }
                            })
                    }
                    else {
                        const loginMaxWrongTrails = process.env.LOGIN_MAX_WRONG_TRIALS;
                        let param = {failedTrials: ++failedTrials};
                        if (failedTrials >= loginMaxWrongTrails) {
                            let trailDelay = process.env.LOGIN_TRIAL_DELAY_IN_HOURS;
                            trailDelay = trailDelay * 60 * 60 * 1000;
                            param = {...param, nextTrial: new Date(new Date().getTime() + trailDelay), message: 'locked'};
                        }
                        updateRestriction(user._id, param)
                            .catch((err) => {
                                errorLog(`Couldn't update user restriction for user: ${user._id}. ${err.toString()}`);
                            })
                        res.status(401)
                            .json({
                                status: "failed",
                                error: req.i18n.t('login.incorrectPassword'),
                                message: {}
                            })
                    }
                });
            })
            .catch((err) => {
                res.status(500)
                    .json({
                        status: "failed",
                        error: req.i18n.t('general.internalError'),
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

const renewAccessToken = async (req, res) => {
    try {
        const {id, firstName, lastName, role} = await req.body.user;
        const user = {_id: id, firstName, lastName, role};
        const accessToken = auth.issueAccessToken(user);
        if (accessToken === 'Error') {
            return res.status(500)
                .json({
                    status: "failed",
                    error: req.i18n.t('security.signingError'),
                    message: {}
                })
        }
        return res.status(200).json({
            status: "success",
            error: "",
            message: {
                accessToken
            }
        })
    }
    catch (err) {
        internalError(req, res, err);
    }
}

const invalidateToken = async (req, res) => {
    try {
        const {mobile: {number: mobileNumber}, tokenType} = await req.body;
        const user = await User.findOne({'mobile.primary.number': mobileNumber});
        if (!user) {
            return res.status(404).json({
                status: "failed",
                error: req.i18n.t('login.userNotFound'),
                message: {}
            })
        }
        if(tokenType === undefined) {
            return res.status(400).json({
                status: "failed",
                error: req.i18n.t('admin.tokenTypeRequired'),
                message: {}
            })
        }
        const {_id: userID} = user;
        switch (tokenType.toString().toLowerCase()) {
            case 'renew':
                Token.findOneAndDelete({userID, type: 'Renew'})
                    .then(() => {
                        res.status(200).json({
                            status: "success",
                            error: "",
                            message: {}
                        })
                    })
                break;

            case 'api':
                Token.findOneAndDelete({userID, type: 'Api'})
                    .then(() => {
                        res.status(200).json({
                            status: "success",
                            error: "",
                            message: {}
                        })
                    })
                break;

            case 'all':
                Token.deleteMany({userID})
                    .then(() => {
                        res.status(200).json({
                            status: "success",
                            error: "",
                            message: {}
                        })
                    })
                break;

            default:
                res.status(400).json({
                    status: "failed",
                    error: req.i18n.t('security.wrongTokenType'),
                    message: {}
                })
        }
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

const generateApiToken = async (req, res) => {
    try {
        const {id} = await req.body.user;
        const user = await User.findOne({_id: id}, {isActive: 1});
        const {isSuspended} = user.isActive;
        if (isSuspended) {
            return res.status(403).json({
                status: "failed",
                error: req.i18n.t('restriction.suspended'),
                message: {}
            })
        }
        else {
            const apiToken = await auth.issueApiToken(user)
                .catch((err) => {
                    return res.status(500)
                        .json({
                            status: "failed",
                            error: req.i18n.t('security.signingError'),
                            message: {}
                        })
                })
            res.status(200).json({
                status: "success",
                error: "",
                message: {
                    apiToken
                }
            })

        }
    }
    catch (err) {
        internalError(req, res, err);
    }
}

const updateSuspension = async (req, res) => {
    try {
        const {mobile: {number: mobileNumber}, isSuspended} = await req.body;
        if(isSuspended === undefined) {
            return res.status(400).json({
                status: "failed",
                error: req.i18n.t('user.noSuspensionStatus'),
                message: {}
            })
        }
        await User.findOne({'mobile.primary.number': mobileNumber})
            .then((user) => {
                if (!user) {
                    return res.status(404).json({
                        status: "failed",
                        error: req.i18n.t('login.userNotFound'),
                        message: {}
                    })
                }
                updateRestriction(user._id, {isSuspended})
                    .then(() => {
                        res.status(205).json({
                            status: "success",
                            error: "",
                            message: {
                                info: req.i18n.t('user.suspensionUpdated')
                            }
                        })
                    })
                    .catch((err) => {
                        res.status(500).json({
                            status: "failed",
                            error: req.i18n.t('user.updateFailed'),
                            message: {}
                        })
                    })
            })
            .catch((err) => {
                internalError(req, res, err);
            })
    }
    catch (err) {
        internalError(req, res, err);
    }
}

const updateRestriction = async (userId, param) => {
    return new Promise((myResolve, myReject) => {
        const {isSuspended, failedTrials, nextTrial} = param;
        const update = {'isActive.isSuspended': isSuspended, 'isActive.login.failedTrials': failedTrials, 'isActive.login.nextTrial': nextTrial};
        Object.keys(update).forEach(key => update[key] === undefined ? delete update[key] : {});
        User.findOneAndUpdate({_id: userId}, update, {projection: {_id: 0, isActive: 1}, new: true})
            .then((user) => {
                myResolve(user);
            })
            .catch((err) => {
                myReject(err);
            })
    })
}

const updateEmail = async (req, res) => {
    try {
        const {email, user: {id}} = await req.body;
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
            if (!regex.test(email)) {
                return res.status(400)
                    .json({
                        status: "failed",
                        error: req.i18n.t(`register.invalidEmail`),
                        message: {}
                    })
            }
            await User.findOne({$and: [{'email.primary': email}, {'email.isVerified': true}]})
                .then(async (result) => {
                    if (!result) {
                        await getUserById(id, {email: 1, isActive: 1, firstName: 1})
                            .then((user) => {
                                const {isActive: {isSuspended}} = user;
                                if (isSuspended) {
                                    return res.status(403).json({
                                        status: "failed",
                                        error: req.i18n.t('restriction.suspended'),
                                        message: {}
                                    })
                                }
                                if (user.email.primary === email || user.email.alternate === email) {
                                    return res.status(400)
                                        .json({
                                            status: "failed",
                                            error: req.i18n.t('user.sameEmail'),
                                            message: {}
                                        })
                                }
                                PreUser.findOne({'otpReceiver.recipient': email})
                                    .then(async (preUser) => {
                                        if (!preUser) {

                                            const updated = async (preUser) => {
                                                await sendEmail(req, {
                                                    template: 'OTP',
                                                    receiver: email,
                                                    action: 'UPDATE',
                                                    firstName: user.firstName,
                                                    outro: 'Hide',
                                                    otp
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
                                                                    otpResend: preUser.otpResend
                                                                }
                                                            })
                                                    })
                                                    .catch((err) => {
                                                        res.status(205)
                                                            .json({
                                                                status: "success",
                                                                error: "",
                                                                message: {
                                                                    email,
                                                                    otpSent: false,
                                                                    info: req.i18n.t('user.emailUpdated'),
                                                                    otpResend: new Date()
                                                                }
                                                            })
                                                    })
                                            }
                                            const notUpdated = (err) => {
                                                updateFailed(req, res, err);
                                            }

                                            const otp = numbers.generateNumber(Number(process.env.OTP_DIGITS_NUMBER));
                                            await PreUser.create({'otpReceiver.recipient': email, otp, action: 'UPDATE', callback: verifyEmailUpdate})
                                                .then(async (preUser) => {
                                                    if (user.email === undefined || !user.email.isVerified) {
                                                        await User.updateOne({_id: id}, {
                                                            'email.primary': email,
                                                            'email.isVerified': false
                                                        })
                                                            .then(updated(preUser))
                                                            .catch(notUpdated)
                                                    } else {
                                                        await User.updateOne({_id: id}, {'email.alternate': email})
                                                            .then(updated(preUser))
                                                            .catch(notUpdated)
                                                    }
                                                })
                                                .catch((err) => {
                                                    updateFailed(req, res, err);
                                                })
                                        }
                                        else {
                                            if (new Date() > preUser.otpRenewal) {

                                                const updated = async () => {
                                                    await sendEmail(req, {
                                                        template: 'OTP',
                                                        receiver: email,
                                                        action: 'UPDATE',
                                                        firstName: user.firstName,
                                                        outro: 'Hide',
                                                        otp
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
                                                            res.status(205)
                                                                .json({
                                                                    status: "success",
                                                                    error: "",
                                                                    message: {
                                                                        email,
                                                                        otpSent: false,
                                                                        info: req.i18n.t('user.emailUpdated'),
                                                                        otpResend: new Date()
                                                                    }
                                                                })
                                                        })
                                                }
                                                const notUpdated = (err) => {
                                                    updateFailed(req, res, err);
                                                }

                                                const otp = numbers.generateNumber(Number(process.env.OTP_DIGITS_NUMBER));
                                                const renewalInterval = Number(process.env.OTP_RENEWAL_IN_HOURS) * (60 * 60 * 1000);
                                                const smsStartingDelay = Number(process.env.OTP_SMS_STARTING_DELAY);
                                                const emailStartingDelay = Number(process.env.OTP_EMAIL_STARTING_DELAY);
                                                const startingDelay = preUser.otpReceiver.country === 'None' ? emailStartingDelay : smsStartingDelay;
                                                const otpResend = new Date(new Date().getTime() + (startingDelay * 60 * 1000));
                                                await PreUser.updateOne({'otpReceiver.recipient': email},
                                                    {
                                                        otp,
                                                        otpDelay: startingDelay,
                                                        otpResend,
                                                        otpRenewal: new Date(new Date().getTime() + renewalInterval),
                                                        wrongTrials: 0,
                                                        action: 'UPDATE'
                                                    })
                                                    .then(async () => {
                                                        if (user.email === undefined || !user.email.isVerified) {
                                                            await User.updateOne({_id: id}, {
                                                                'email.primary': email,
                                                                'email.isVerified': false
                                                            })
                                                                .then(updated)
                                                                .catch(notUpdated)
                                                        } else {
                                                            await User.updateOne({_id: id}, {'email.alternate': email})
                                                                .then(updated)
                                                                .catch(notUpdated)

                                                        }
                                                    })
                                                    .catch((err) => {
                                                        updateFailed(req, res, err);
                                                    })
                                            } else {
                                                if (preUser.wrongTrials >= Number(process.env.OTP_MAX_WRONG_TRIALS)) {
                                                    res.status(403)
                                                        .json({
                                                            status: "failed",
                                                            error: req.i18n.t('user.emailUsageSuspended'),
                                                            message: {
                                                                otpResend: preUser.otpRenewal
                                                            }
                                                        })
                                                } else {
                                                    if (new Date() > preUser.otpResend) {

                                                        const updated = async () => {
                                                            await sendEmail(req, {
                                                                template: 'OTP',
                                                                receiver: email,
                                                                action: 'UPDATE',
                                                                firstName: user.firstName,
                                                                outro: 'Hide',
                                                                otp
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
                                                                    res.status(205)
                                                                        .json({
                                                                            status: "success",
                                                                            error: "",
                                                                            message: {
                                                                                email,
                                                                                otpSent: false,
                                                                                info: req.i18n.t('user.emailUpdated'),
                                                                                otpResend: new Date()
                                                                            }
                                                                        })
                                                                })
                                                        }
                                                        const notUpdated = (err) => {
                                                            updateFailed(req, res, err);
                                                        }

                                                        const otp = preUser.otp;
                                                        const smsDelayMultiplier = Number(process.env.OTP_SMS_DELAY_MULTIPLIER);
                                                        const emailDelayMultiplier = Number(process.env.OTP_EMAIL_DELAY_MULTIPLIER);
                                                        const delayMultiplier = preUser.otpReceiver.country === 'None' ? emailDelayMultiplier : smsDelayMultiplier;
                                                        const otpDelay = preUser.otpDelay * delayMultiplier;
                                                        const otpResend = new Date(new Date().getTime() + (otpDelay * 60 * 1000));
                                                        await PreUser.updateOne({'otpReceiver.recipient': email},
                                                            {
                                                                otpDelay,
                                                                otpResend,
                                                                action: 'UPDATE'
                                                            })
                                                            .then(async () => {
                                                                if (user.email === undefined || !user.email.isVerified) {
                                                                    await User.updateOne({_id: id}, {
                                                                        'email.primary': email,
                                                                        'email.isVerified': false
                                                                    })
                                                                        .then(updated)
                                                                        .catch(notUpdated)
                                                                } else {
                                                                    await User.updateOne({_id: id}, {'email.alternate': email})
                                                                        .then(updated)
                                                                        .catch(notUpdated)

                                                                }
                                                            })
                                                            .catch((err) => {
                                                                updateFailed(req, res, err);
                                                            })
                                                    } else {
                                                        res.status(401)
                                                            .json({
                                                                status: "failed",
                                                                error: req.i18n.t('user.emailUsageSuspended'),
                                                                message: {
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
                            })
                            .catch((err) => {
                                internalError(req, res, err);
                            })

                    } else {
                        return res.status(401)
                            .json({
                                status: "failed",
                                error: req.i18n.t('user.emailExisted'),
                                message: {}
                            })
                    }
                })
                .catch((err) => {
                    internalError(req, res, err);
                })
        }

    }
    catch (err) {
        internalError(req, res, err);
    }
}

const verifyEmailUpdate = async (req, res, id) => {
    try {
        if (id === undefined) {
            return res.status(401)
                .json({
                    status: "failed",
                    error: req.i18n.t('user.invalidAction'),
                    message: {}
                })
        }
        await User.findOne({_id: id})
            .then(async (user) => {
                if (!user.email.isVerified) {
                    const email = user.email.primary;
                    await User.updateOne({_id:id}, {'email.isVerified': true})
                        .then(async () => {
                            await PreUser.deleteOne({'otpReceiver.recipient': email})
                            return res.status(205)
                                .json({
                                    status: "success",
                                    error: "",
                                    message: {
                                        email,
                                        info: req.i18n.t('user.emailVerified'),
                                    }
                                })
                        })
                        .catch((err) => {
                            updateFailed(req, res, err);
                        })
                }
                else {
                    const email = user.email.alternate;
                    await User.updateOne({_id:id}, {'email.primary': email, $unset: {'email.alternate': 1}})
                        .then(async () => {
                            await PreUser.deleteOne({'otpReceiver.recipient': email})
                            return res.status(205)
                                .json({
                                    status: "success",
                                    error: "",
                                    message: {
                                        email,
                                        info: req.i18n.t('user.emailVerified'),
                                    }
                                })
                        })
                        .catch((err) => {
                            updateFailed(req, res, err);
                        })
                }
            })
            .catch((err) => {
                updateFailed(req, res, err);
            })
    }
    catch (err) {
        updateFailed(req, res, err);
    }
}

const updateMobile = async (req, res) => {
    try {
        const {mobile, user: {id}} = await req.body;
        if (mobile === undefined) {
            return res.status(400)
                .json({
                    status: "failed",
                    error: req.i18n.t(`register.mobileRequired`),
                    message: {}
                })
        }
        else {
            const {number: mobileNumber, country} = mobile;
            await User.findOne({$and: [{'mobile.primary': mobileNumber}, {'mobile.isVerified': true}]})
                .then(async (result) => {
                    if (!result) {
                        await getUserById(id, {mobile: 1, isActive: 1})
                            .then((user) => {
                                const {isActive: {isSuspended}} = user;
                                if (isSuspended) {
                                    return res.status(403).json({
                                        status: "failed",
                                        error: req.i18n.t('restriction.suspended'),
                                        message: {}
                                    })
                                }
                                if (user.mobile.primary.number === mobileNumber || user.mobile.alternate === mobileNumber) {
                                    return res.status(400)
                                        .json({
                                            status: "failed",
                                            error: req.i18n.t('user.sameMobile'),
                                            message: {}
                                        })
                                }
                                PreUser.findOne({'otpReceiver.recipient': mobileNumber})
                                    .then(async (preUser) => {
                                        if (!preUser) {

                                            const updated = async (preUser) => {
                                                await sendSMS(otp, mobileNumber, country)
                                                    .then(({aggregator, price}) => {
                                                        logSMS(user._id, otp, mobileNumber, country, aggregator, price, 'Update Mobile Number');
                                                        res.status(205)
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
                                                        res.status(205)
                                                            .json({
                                                                status: "success",
                                                                error: "",
                                                                message: {
                                                                    mobileNumber,
                                                                    otpSent: false,
                                                                    info: req.i18n.t('user.mobileUpdated'),
                                                                    otpResend: new Date()
                                                                }
                                                            })
                                                    })
                                            }
                                            const notUpdated = (err) => {
                                                updateFailed(req, res, err);
                                            }

                                            const otp = numbers.generateNumber(Number(process.env.OTP_DIGITS_NUMBER));
                                            await PreUser.create({'otpReceiver.recipient': mobileNumber, 'otpReceiver.country': country, otp, action: 'UPDATE', callback: verifyMobileUpdate})
                                                .then(async (preUser) => {
                                                    if (user.mobile === undefined || !user.mobile.isVerified) {
                                                        await User.updateOne({_id: id}, {
                                                            'mobile.primary.number': mobileNumber,
                                                            'mobile.primary.country': country,
                                                            'mobile.isVerified': false
                                                        })
                                                            .then(updated(preUser))
                                                            .catch(notUpdated)
                                                    }
                                                    else {
                                                        await User.updateOne({_id: id}, {'mobile.alternate.number': mobileNumber, 'mobile.alternate.country': country})
                                                            .then(updated(preUser))
                                                            .catch(notUpdated)
                                                    }
                                                })
                                                .catch((err) => {
                                                    updateFailed(req, res, err);
                                                })
                                        }
                                        else {
                                            if (new Date() > preUser.otpRenewal) {

                                                const updated = async () => {
                                                    await sendSMS(otp, mobileNumber, country)
                                                        .then(({aggregator, price}) => {
                                                            logSMS(user._id, otp, mobileNumber, country, aggregator, price, 'Update Mobile Number');
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
                                                            res.status(205)
                                                                .json({
                                                                    status: "success",
                                                                    error: "",
                                                                    message: {
                                                                        mobileNumber,
                                                                        otpSent: false,
                                                                        info: req.i18n.t('user.mobileUpdated'),
                                                                        otpResend: new Date()
                                                                    }
                                                                })
                                                        })
                                                }
                                                const notUpdated = (err) => {
                                                    updateFailed(req, res, err);
                                                }

                                                const otp = numbers.generateNumber(Number(process.env.OTP_DIGITS_NUMBER));
                                                const renewalInterval = Number(process.env.OTP_RENEWAL_IN_HOURS) * (60 * 60 * 1000);
                                                const smsStartingDelay = Number(process.env.OTP_SMS_STARTING_DELAY);
                                                const emailStartingDelay = Number(process.env.OTP_EMAIL_STARTING_DELAY);
                                                const startingDelay = preUser.otpReceiver.country === 'None' ? emailStartingDelay : smsStartingDelay;
                                                const otpResend = new Date(new Date().getTime() + (startingDelay * 60 * 1000));
                                                await PreUser.updateOne({'otpReceiver.recipient': mobileNumber},
                                                    {
                                                        otp,
                                                        otpDelay: startingDelay,
                                                        otpResend,
                                                        otpRenewal: new Date(new Date().getTime() + renewalInterval),
                                                        wrongTrials: 0,
                                                        action: 'UPDATE'
                                                    })
                                                    .then(async () => {
                                                        if (user.mobile === undefined || !user.mobile.isVerified) {
                                                            await User.updateOne({_id: id}, {
                                                                'mobile.primary.number': mobileNumber,
                                                                'mobile.primary.country': country,
                                                                'mobile.isVerified': false
                                                            })
                                                                .then(updated)
                                                                .catch(notUpdated)
                                                        }
                                                        else {
                                                            await User.updateOne({_id: id}, {'mobile.alternate.number': mobileNumber, 'mobile.alternate.country': country})
                                                                .then(updated)
                                                                .catch(notUpdated)

                                                        }
                                                    })
                                                    .catch((err) => {
                                                        updateFailed(req, res, err);
                                                    })
                                            } else {
                                                if (preUser.wrongTrials >= Number(process.env.OTP_MAX_WRONG_TRIALS)) {
                                                    res.status(403)
                                                        .json({
                                                            status: "failed",
                                                            error: req.i18n.t('user.mobileUsageSuspended'),
                                                            message: {
                                                                otpResend: preUser.otpRenewal
                                                            }
                                                        })
                                                } else {
                                                    if (new Date() > preUser.otpResend) {

                                                        const updated = async () => {
                                                            await sendSMS(otp, mobileNumber, country)
                                                                .then(({aggregator, price}) => {
                                                                    logSMS(user._id, otp, mobileNumber, country, aggregator, price, 'Update Mobile Number');
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
                                                                    res.status(205)
                                                                        .json({
                                                                            status: "success",
                                                                            error: "",
                                                                            message: {
                                                                                mobileNumber,
                                                                                otpSent: false,
                                                                                info: req.i18n.t('user.mobileUpdated'),
                                                                                otpResend: new Date()
                                                                            }
                                                                        })
                                                                })
                                                        }
                                                        const notUpdated = (err) => {
                                                            updateFailed(req, res, err);
                                                        }

                                                        const otp = preUser.otp;
                                                        const smsDelayMultiplier = Number(process.env.OTP_SMS_DELAY_MULTIPLIER);
                                                        const emailDelayMultiplier = Number(process.env.OTP_EMAIL_DELAY_MULTIPLIER);
                                                        const delayMultiplier = preUser.otpReceiver.country === 'None' ? emailDelayMultiplier : smsDelayMultiplier;
                                                        const otpDelay = preUser.otpDelay * delayMultiplier;
                                                        const otpResend = new Date(new Date().getTime() + (otpDelay * 60 * 1000));
                                                        await PreUser.updateOne({'otpReceiver.recipient': mobileNumber},
                                                            {
                                                                otpDelay,
                                                                otpResend,
                                                                action: 'UPDATE'
                                                            })
                                                            .then(async () => {
                                                                if (user.mobile === undefined || !user.mobile.isVerified) {
                                                                    await User.updateOne({_id: id}, {
                                                                        'mobile.primary.number': mobileNumber,
                                                                        'mobile.primary.country': country,
                                                                        'mobile.isVerified': false
                                                                    })
                                                                        .then(updated)
                                                                        .catch(notUpdated)
                                                                }
                                                                else {
                                                                    await User.updateOne({_id: id}, {'mobile.alternate.number': mobileNumber, 'mobile.alternate.country': country})
                                                                        .then(updated)
                                                                        .catch(notUpdated)

                                                                }
                                                            })
                                                            .catch((err) => {
                                                                updateFailed(req, res, err);
                                                            })
                                                    } else {
                                                        res.status(401)
                                                            .json({
                                                                status: "failed",
                                                                error: req.i18n.t('user.mobileUsageSuspended'),
                                                                message: {
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
                            })
                            .catch((err) => {
                                internalError(req, res, err);
                            })
                    }
                    else {
                        return res.status(401)
                            .json({
                                status: "failed",
                                error: req.i18n.t('user.mobileExisted'),
                                message: {}
                            })
                    }
                })
                .catch((err) => {
                    internalError(req, res, err);
                })
        }
    }
    catch (err) {
        internalError(req, res, err);
    }
}

const verifyMobileUpdate = async (req, res, id) => {
    try {
        if (id === undefined) {
            return res.status(401)
                .json({
                    status: "failed",
                    error: req.i18n.t('user.invalidAction'),
                    message: {}
                })
        }
        await User.findOne({_id: id})
            .then(async (user) => {
                if (!user.mobile.isVerified) {
                    const mobileNumber = user.mobile.primary.number;
                    await User.updateOne({_id:id}, {'mobile.isVerified': true})
                        .then(async () => {
                            await PreUser.deleteOne({'otpReceiver.recipient': mobileNumber})
                            return res.status(205)
                                .json({
                                    status: "success",
                                    error: "",
                                    message: {
                                        mobileNumber,
                                        info: req.i18n.t('user.mobileVerified'),
                                    }
                                })
                        })
                        .catch((err) => {
                            updateFailed(req, res, err);
                        })
                }
                else {
                    const mobileNumber = user.mobile.alternate.number;
                    const country = user.mobile.alternate.country;
                    await User.updateOne({_id:id}, {'mobile.primary.number': mobileNumber, 'mobile.primary.country': country, $unset: {'mobile.alternate': 1}})
                        .then(async () => {
                            await PreUser.deleteOne({'otpReceiver.recipient': mobileNumber})
                            return res.status(205)
                                .json({
                                    status: "success",
                                    error: "",
                                    message: {
                                        mobileNumber,
                                        info: req.i18n.t('user.mobileVerified'),
                                    }
                                })
                        })
                        .catch((err) => {
                            updateFailed(req, res, err);
                        })
                }
            })
            .catch((err) => {
                updateFailed(req, res, err);
            })
    }
    catch (err) {
        updateFailed(req, res, err);
    }
}

const updateBalances = async (userId, param) => {
    return new Promise((myResolve, myReject) => {
        const {paidCourtesy, paidBalance, paidCredit} = param;
        const update = {'subscription.savingPlan.credit': paidCredit, courtesy: paidCourtesy, balance: paidBalance};
        Object.keys(update).forEach(key => update[key] === undefined ? delete update[key] : {});
        User.findOneAndUpdate({_id: userId}, {$inc: update},
            {projection: {_id: 0, balance: 1, courtesy: 1, 'subscription.savingPlan.credit': 1}, new: true})
            .then((user) => {
                const balance = Number(user.balance);
                const courtesy = Number(user.courtesy);
                const credit = Number(user.subscription.savingPlan.credit);
                myResolve({courtesy, balance, credit});
            })
            .catch((err) => {
                myReject(err);
            })
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

const updateFailed = (req, res, err) => {
    res.status(404)
        .json({
            status: "failed",
            error: req.i18n.t('user.updateFailed'),
            message: {
                info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
            }
        })
}

const changePassword = async (req, res) => {
    try {
        const {user, oldPassword, newPassword, verificationCode, mobileNumber, email} = await req.body;
        if (user.role !== 'Guest') {
            if (oldPassword === newPassword) {
                return res.status(400)
                    .json({
                        status: "failed",
                        error: req.i18n.t('user.samePassword'),
                        message: {}
                    })
            }
            await getUserById(user.id, {password: 1, isActive: 1})
                .then((user) => {
                    const {isActive: {isSuspended}} = user;
                    if (isSuspended) {
                        return res.status(403).json({
                            status: "failed",
                            error: req.i18n.t('restriction.suspended'),
                            message: {}
                        })
                    }
                    user.comparePassword(oldPassword, async (err, isMatch) => {
                        if (err) {
                            return actionError(req, res, err);
                        }
                        if (isMatch) {
                            user.password = newPassword;
                            await user.save()
                                .then(() => {
                                    return res.status(205)
                                        .json({
                                            status: "success",
                                            error: "",
                                            message: {
                                                info: req.i18n.t('user.passwordChanged'),
                                            }
                                        })
                                })
                                .catch((err) => {
                                    actionError(req, res, err);
                                })
                        }
                        else {
                            return res.status(401)
                                .json({
                                    status: "failed",
                                    error: req.i18n.t('login.incorrectPassword'),
                                    message: {}
                                })
                        }
                    })
                })
                .catch((err) => {
                    internalError(req, res, err);
                })
        }
        else {
            let receiver = 'None';
            if (mobileNumber !== undefined) {
                receiver = mobileNumber;
            }
            if (email !== undefined) {
                receiver = email;
            }
            PreUser.findOne({'otpReceiver.recipient': receiver})
                .then(async (preUser) => {
                    if (!preUser) {
                        res.status(400)
                            .json({
                                status: "failed",
                                error: req.i18n.t('user.noPreUser'),
                                message: {}
                            })
                    }
                    else {
                        if (verificationCode === preUser.verificationCode) {
                            User.findOne({$or: [{'mobile.primary.number': mobileNumber}, {'email.primary': email}]})
                                .then(async (user) => {
                                    user.password = newPassword;
                                    await user.save()
                                        .then(async () => {
                                            await preUser.deleteOne()
                                            return res.status(205)
                                                .json({
                                                    status: "success",
                                                    error: "",
                                                    message: {
                                                        info: req.i18n.t('user.passwordReset'),
                                                    }
                                                })
                                        })
                                        .catch((err) => {
                                            actionError(req, res, err);
                                        })
                                })
                                .catch((err) => {
                                    res.status(400)
                                        .json({
                                            status: "failed",
                                            error: req.i18n.t('user.actionError'),
                                            message: {}
                                        })
                                })
                        }
                        else {
                            res.status(401)
                                .json({
                                    status: "failed",
                                    error: req.i18n.t('user.incorrectPreUser'),
                                    message: {}
                                })
                        }
                    }
                })
                .catch((err) => {
                    internalError(req, res, err);
                })
        }
    }
    catch (err) {
        internalError(req, res, err);
    }
}

const actionError = (req, res, err) => {
    if (err.errors !== undefined) {
        let resourceID = ''
        if (typeof err.errors.password != 'undefined') {
            resourceID = err.errors.password.message;
        }
        if (resourceID !== '') {
            res.status(400)
                .json({
                    status: "failed",
                    error: req.i18n.t(`register.${resourceID}`),
                    message: {}
                })
        }
    }
    else {
        res.status(404)
            .json({
                status: "failed",
                error: req.i18n.t('user.actionError'),
                message: {
                    info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
                }
            })
    }
}

const getUsers = async (req, res) => {
    try {
        User.find()
            .then((users) => {
                users = users.map((user) => {
                    user.password = undefined;
                    user._id = undefined;
                    user.__v = undefined;
                    return user;
                } )
                res.status(200)
                    .json({
                        status: "success",
                        error: "",
                        message: {
                            users
                        }
                    })
            })
            .catch((err) => {
                res.status(404)
                    .json({
                        status: "failed",
                        error: req.i18n.t('general.internalError'),
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

const getUserById = (userId, options = {}) => {
    return new Promise((myResolve, myReject) => {
        User.findById(userId, options)
            .then((user) => {
                myResolve(user);
            })
            .catch((err) => {
                myReject(err);
            })
    })
}

const getUserByMobile = async (req, res) => {
    try {
        const {mobile: {number: mobileNumber}} = await req.body;
        User.findOne({'mobile.primary.number': mobileNumber})
            .then((user) => {
                if (!user) {
                    res.status(404)
                        .json({
                            status: "failed",
                            error: req.i18n.t('login.userNotFound'),
                            message: {

                            }
                        })
                    return;
                }
                user.password = undefined;
                user._id = undefined;
                user.__v = undefined;
                res.status(200)
                    .json({
                        status: "success",
                        error: "",
                        message: {
                            user
                        }
                    })
            })
            .catch((err) => {
                res.status(500)
                    .json({
                        status: "failed",
                        error: req.i18n.t('general.internalError'),
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

const updateSubscription = async (req, res) => {
    try {
        const {user: {id: userID}, savingPlan, services} = await req.body;
        const payment = await Payment.find({userID, paymentType: 'Subscription'}).sort({'paymentDetails.date': -1}).limit(1);
        if (payment.length !== 0 && payment[0].paymentDetails.status === 'Pending') {
            return res.status(403).json({
                status: "failed",
                error: req.i18n.t('payment.pendingSubscription'),
                message: {}
            })
        }
        const user = await User.findOne({_id: userID}, {subscription: 1});
        const userSubscription = user.subscription;
        const subscription = userSubscription.toJSON();
        const yesterdayMidnight = new Date(new Date().getTime() - (24 * 60 * 60 * 1000));
        yesterdayMidnight.setHours(0, 0, 0, 0);

        if (savingPlan !== undefined) {
            const {planName, price, renewal: {trigger, creditTrigger}} = savingPlan;
            if (planName === 'PAYG') {
                if (subscription.savingPlan.renewal.action !== undefined) {
                    subscription.savingPlan.renewal.action = 'Cancel';
                }
            }
            else {
                const {price: planPrice} = await getPlanPrice(planName);
                if (price !== planPrice) {
                    return res.status(404).json({
                        status: "failed",
                        error: req.i18n.t('subscription.incorrectPrice'),
                        message: {}
                    })
                }
                if (userSubscription.savingPlan.name === undefined || !userSubscription.savingPlan.isEffective) {
                    if (subscription.renewalDate === undefined) {
                        subscription.renewalDate = yesterdayMidnight;
                    }
                    subscription.savingPlan.name = planName;
                    subscription.savingPlan.price = price;
                    subscription.savingPlan.credit = 0;
                    subscription.savingPlan.isEffective = false;
                    subscription.savingPlan.renewal.action = 'Renew';
                    subscription.savingPlan.renewal.price = price;
                    subscription.savingPlan.renewal.nextSavingPlan = planName;
                    subscription.savingPlan.renewal.trigger = trigger;
                    subscription.savingPlan.renewal.creditTrigger = creditTrigger;
                    subscription.savingPlan.renewal.renewalStatus = 'Waiting';
                }
                else {
                    subscription.savingPlan.renewal.action = 'Renew';
                    subscription.savingPlan.renewal.price = price;
                    subscription.savingPlan.renewal.nextSavingPlan = planName;
                    subscription.savingPlan.renewal.trigger = trigger;
                    subscription.savingPlan.renewal.creditTrigger = creditTrigger;
                }
            }
        }
        if (services !== undefined) {
            let i = subscription.services.length;
            for (const service of services) {
                const {serviceName, isAdding, price, settings} = service;
                if (isAdding === undefined || typeof isAdding != 'boolean') {
                    return res.status(400).json({
                        status: "failed",
                        error: req.i18n.t('subscription.invalidServiceStatus'),
                        message: {}
                    })
                }
                const serviceData = await getServiceData(serviceName);
                if (isAdding) {
                    let serviceFound = false;
                    for (const element of subscription.services) {
                        if (element.name === serviceName) {
                            serviceFound = true;
                            break;
                        }
                    }
                    if (!serviceFound) {
                        if (price !== serviceData.price) {
                            return res.status(404).json({
                                status: "failed",
                                error: req.i18n.t('subscription.incorrectPrice'),
                                message: {}
                            })
                        }
                        if (Object.keys(serviceData.settings).sort().toString() !== Object.keys(settings).sort().toString()) {
                            return res.status(404).json({
                                status: "failed",
                                error: req.i18n.t('subscription.invalidServiceSettings'),
                                message: {}
                            })
                        }
                        if (subscription.renewalDate === undefined) {
                            subscription.renewalDate = yesterdayMidnight;
                        }
                        subscription.services[i] = {};
                        subscription.services[i].renewal = {};
                        subscription.services[i].name = serviceName;
                        subscription.services[i].price = price;
                        subscription.services[i].isEffective = false;
                        subscription.services[i].settings = settings;
                        subscription.services[i].renewal.action = 'Renew';
                        i++;
                    }
                }
                else {
                    let j = 0;
                    for (const element of subscription.services) {
                        if (element.name === serviceName) {
                            if (element.isEffective) {
                                element.renewal.action = 'Cancel'
                            }
                            else {
                                subscription.services.splice(j, 1);
                                i--;
                            }
                            break;
                        }
                        j++;
                    }
                }
            }
        }
        user.subscription = subscription;
        await user.save()
            .then(() => {
                res.status(201).json({
                    status: "success",
                    error: "",
                    message: {
                        subscription
                    }
                })
            })
    }
    catch (err) {
        if (err.errors !== undefined && err.errors['subscription.savingPlan.renewal.trigger'] !== undefined) {
            err = err.errors['subscription.savingPlan.renewal.trigger'].message;
        }
        if (['unavailableService', 'unavailablePlan', 'invalidTrigger'].includes(err.toString())) {
            res.status(400).json({
                status: "failed",
                error: req.i18n.t(`subscription.${err}`),
                message: {}
            })
        }
        else {
            internalError(req, res, err);
        }
    }
}

const getCoupons = (coupons, userID) => {
    return new Promise(async (myResult, myReject) => {
        User.findOne({_id: userID}, {coupons: 1})
            .then((user) => {
                if (coupons.length === 0) {
                    myResult(user.coupons);
                }
                else {
                    const resultCoupons = [];
                    for (const coupon of coupons) {
                        for (const userCoupon of user.coupons) {
                            if (userCoupon.code === coupon) {
                                resultCoupons.push(coupon);
                            }
                        }
                    }
                    myResult(resultCoupons);
                }
            })
            .catch((err) => {
                myReject(err);
            })
    })
}

const completePayment = (paymentData) => {
    return new Promise((myResolve, myReject) => {
        const {userID, id, paymentType, amount, adviceDate} = paymentData;
        User.findOne({_id: userID}, {'mobile.primary.number': 1, payments: 1, units: 1})
            .then(async (user) => {
                const {'mobile.primary.number': mobileNumber} = user;
                const paymentMethod= 'creditCard';
                const unitId = null;
                user.payments.push({id, paymentMethod, paymentType, amount, adviceDate, unitId});
                switch (paymentType) {
                    case 'booking':
                        Unit.find({isActive: true}, {_id: 0, images: 0, isActive: 0})
                            .then((units) => {
                                const bookingAmount = units[0].bookingAmount;
                                const paymentSubset = user.payments.filter((item) => item.unitId === null);
                                if (paymentSubset.reduce((sum, item) => sum + item.amount, 0) >= bookingAmount) {

                                    user.units.push({priceDetails: units, bookingDate: new Date()});
                                }
                            })
                            .catch((err) => {
                                myReject(err.toString());
                            })
                }
                await user.save()
                    .then(() => {
                        myResolve();
                    })
                    .catch((err) => {
                        myReject(err.toString());
                    })
            })
            .catch((err) => {
                myReject(err.toString())
            })
    })
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

const checkFund = (userID, products) => {
    return new Promise(async (myResolve, myReject) => {
        const options = {plan: 1, balance: 1, courtesy: 1, subscription: 1};
        const user = await getUserById(userID, options);
        let {plan, subscription, balance, courtesy} = user;
        balance = Number(balance);
        courtesy = Number(courtesy);
        const nextRenewalDay = new Date(new Date(subscription.renewalDate).getTime() + (24 * 60 * 60 * 1000));
        if (new Date() > nextRenewalDay && subscription.savingPlan.renewal.action === 'Cancel') {
            plan = 'PAYG';
            user.plan = 'PAYG';
            user.subscription = {};
            user.save();
        }
        let {savingPlan: {credit}} = subscription;
        if (credit !== undefined) {
            credit = Number(credit);
        }
        const sellingPrice = await getSellingPrice(credit === 0 ? 'PAYG' : plan, products);
        let paidCourtesy = 0.00, paidBalance = 0.00, paidCredit = 0.00;
        if (plan === 'PAYG') {
            if (courtesy >= sellingPrice) {
                paidCourtesy = sellingPrice;
            }
            else if ((courtesy + balance) >= sellingPrice) {
                paidCourtesy = courtesy;
                paidBalance = (sellingPrice - courtesy).toFixed(3);
            }
            else {
                myReject('insufficientBalance');
            }
        }
        else {
            if (credit >= sellingPrice && new Date() < nextRenewalDay) {
                paidCredit = sellingPrice * -1;
            }
            else if (credit < sellingPrice) {
                if ((credit + courtesy) >= sellingPrice) {
                    paidCredit = credit * -1;
                    paidCourtesy = Number((sellingPrice - credit).toFixed(3)) * -1;
                }
                else if ((credit + courtesy + balance) >= sellingPrice) {
                    paidCredit = credit * -1;
                    paidCourtesy = courtesy * -1;
                    paidBalance = Number((sellingPrice - credit - courtesy).toFixed(3)) * -1;
                }
                else {
                    myReject('insufficientCredit');
                }
            }
            else {
                myReject('subscriptionExpired');
            }
        }
        myResolve({paidCourtesy, paidBalance, paidCredit});
    })
}

const getPaymentOptions = async (req, res) => {
    try {
        Unit.findOne({}, {bookingAmount: 1, contractingAmount: 1, _id: 0})
            .then(({bookingAmount, contractingAmount}) => {
                res.status(200).json({
                    status: "success",
                    error: "",
                    message: {
                        bookingAmount,
                        contractingAmount
                    }
                })
            })
            .catch((err) => {
                res.status(500).json(
                    {
                        status: "failed",
                        error: req.i18n.t('general.internalError'),
                        message: {
                            info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
                        }
                    })
            })
    }
    catch (err) {
        res.status(500).json(
            {
                status: "failed",
                error: req.i18n.t('general.internalError'),
                message: {
                    info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
                }
            })
    }
}

module.exports = {
    createUser,
    login,
    renewAccessToken,
    invalidateToken,
    generateApiToken,
    getUsers,
    getUserById,
    getUserByMobile,
    updateEmail,
    changePassword,
    updateMobile,
    updateBalances,
    updateSuspension,
    updateSubscription,
    getCoupons,
    completePayment,
    checkFund,
    getPaymentOptions
}

