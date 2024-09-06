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
const {createSmsRecord} = require("./smsRecords");
const Unit = require('../models/units');
const Image = require('../utils/imageProcessing');
const {Readable} = require('stream');
const {S3Client} = require('@aws-sdk/client-s3');
const {Upload} = require("@aws-sdk/lib-storage");
const Process = require("process");
const Notification = require('../models/notifications');

const createUser = async (req, res) => {
    try {
        const bodyData = await {...req.body, role: 'USER'};
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
                                    identification: undefined, notifications: undefined, role: undefined, isActive: undefined
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
        const projection = {firstName: 1, lastName: 1, password: 1, mobile: 1, profilePhoto: 1, role: 1, isActive: 1};
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
                        res.status(200).json({
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
                                                        res.status(200)
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
                                                        res.status(200)
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
                                                            res.status(200)
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
                                                            res.status(200)
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
                                                                    res.status(200)
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
                                                                    res.status(200)
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
                            return res.status(200)
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
                            return res.status(200)
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
                                                        res.status(200)
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
                                                        res.status(200)
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
                                                            res.status(200)
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
                                                            res.status(200)
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
                                                                    res.status(200)
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
                                                                    res.status(200)
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
                            return res.status(200)
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
                            return res.status(200)
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
                                    return res.status(200)
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
                                            return res.status(200)
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

const checkUnitId = (userID, unitId) => {
    return new Promise(async (myResolve, myReject) => {
        User.findOne({_id: userID}, {units: 1, _id: 0})
            .then((user) => {
                if (user.units.length === 0) {
                    myReject('invalidUnitId');
                }
                else {
                    const foundItems = user.units.filter((item) => item.id === unitId);
                    if (foundItems.length > 0) {
                        myResolve();
                    }
                    else {
                        myReject('invalidUnitId');
                    }
                }
            })
            .catch((err) => {
                myReject('invalidUnitId');
            })
    })
}

const checkCategory = (userID, unitId) => {
    return new Promise(async (myResolve, myReject) => {
        User.findOne({_id: userID}, {units: 1, _id: 0})
            .then((user) => {
                const myUnit = user.units.filter((item) => item.id === unitId)
                if (myUnit[0].category === undefined) {
                    myReject('invalidCategory');
                }
                else {
                    myResolve();
                }
            })
            .catch((err) => {
                myReject('invalidCategory');
            })
    })
}

const completePayment = (paymentData) => {
    return new Promise((myResolve, myReject) => {
        const {userID, id, paymentType, paymentMethod, amount, adviceDate, unitId} = paymentData;
        User.findOne({_id: userID}, {'mobile.primary.number': 1, payments: 1, units: 1, notifications: 1})
            .then( async (user) => {
                const {mobile: {primary: {number: mobileNumber}}} = user;
                user.payments.push({id, paymentMethod, paymentType, amount, adviceDate, unitId});

                switch (paymentType) {
                    case 'booking':
                        Unit.find({isActive: true}, {_id: 0, images: 0, isActive: 0})
                            .then(async (units) => {
                                const bookingAmount = units[0].bookingAmount;
                                const bookingPayments = user.payments.filter((item) => item.unitId === unitId);
                                const paidBooking = bookingPayments.reduce((sum, item) => sum + Number(item.amount), 0);
                                if (paidBooking >= Number(bookingAmount)) {
                                    const unitId = `${mobileNumber}-${user.units.length + 1}`
                                    user.units.push({id: unitId, priceDetails: units, bookingDate: new Date()});
                                    user.payments.map((item) => {
                                        if (item.unitId === '') item.unitId = unitId
                                    })

                                    const messages = await Notification.findOne({name: 'booking'}, {_id: 0, messages: 1});
                                    const arabicMessage = messages.ar;
                                    const englishMessage = messages.en;
                                    const contractingAmount = units[0].contractingAmount;
                                    errorLog(arabicMessage)
                                    errorLog(englishMessage)

                                    await user.save()
                                        .then(() => {
                                            myResolve();
                                        })
                                        .catch((err) => {
                                            myReject(err.toString());
                                        })
                                }
                                else {

                                    const {messages} = await Notification.findOne({name: 'booking'}, {_id: 0, messages: 1});
                                    const arabicMessage = messages.ar;
                                    const englishMessage = messages.en;
                                    console.log(arabicMessage)
                                    console.log(englishMessage)

                                    await user.save()
                                        .then(() => {
                                            myResolve();
                                        })
                                        .catch((err) => {
                                            myReject(err.toString());
                                        })
                                }
                            })
                            .catch((err) => {
                                myReject(err.toString());
                            })
                        break;

                    case 'contracting':
                        const unit = user.units.filter((item) => item.id === unitId);
                        const contractingAmount = unit[0].priceDetails[0].contractingAmount;
                        const contractingPayments = user.payments.filter((item) => {
                            return item.unitId === unitId && item.paymentType === 'contracting'
                        });
                        const paidContracting = contractingPayments.reduce((sum, item) => sum + Number(item.amount), 0);
                        if (paidContracting >= Number(contractingAmount)) {
                            user.units.map((item) => {
                                if (item.id === unitId) item.contractingDate = new Date();
                            })
                        }
                        await user.save()
                            .then(() => {
                                myResolve();
                            })
                            .catch((err) => {
                                myReject(err.toString());
                            })
                        break;

                    case 'cashing':
                        const myUnit = user.units.filter((item) => item.id === unitId);
                        const category = myUnit[0].category;
                        const priceDetails = myUnit[0].priceDetails.filter((item) => item.category === category);
                        const cashAmount = priceDetails[0].cashAmount;
                        const totalPayments = user.payments.filter((item) => item.unitId === unitId);
                        const paidTotal = totalPayments.reduce((sum, item) => sum + Number(item.amount), 0);
                        if (paidTotal >= Number(cashAmount)) {
                            user.units.map((item) => {
                                if (item.id === unitId) item.completionDate = new Date();
                            })
                        }
                        await user.save()
                            .then(() => {
                                myResolve();
                            })
                            .catch((err) => {
                                myReject(err.toString());
                            })
                        break;
                }
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

const getPaymentOptions = async (req, res) => {
    try {
        const {user: {id: userID}} = await req.body;
        const paymentOptions = [];

        User.findOne({_id: userID}, {payments: 1, units: 1, _id: 0})
            .then((user) => {
                Unit.findOne({}, {bookingAmount: 1, contractingAmount: 1, _id: 0})
                    .then(({bookingAmount, contractingAmount}) => {
                        let paidBooking = 0;
                        let option;
                        if (user.payments.length > 0) {
                            const unitIdList = user.payments.map((item) => item.unitId);
                            const unitIdUniqueList = [... new Set(unitIdList)];
                            unitIdUniqueList.forEach((unitId) => {
                                const paymentSubset = user.payments.filter((item) => item.unitId === unitId);
                                if (unitId === '') {
                                    paidBooking = paymentSubset.reduce((sum, item) => sum + Number(item.amount), 0);
                                }
                                else {
                                    const myUnit = user.units.filter((item) => item.id === unitId);
                                    const contractingDate = myUnit[0].contractingDate;
                                    const contractDate = myUnit[0].contractDate;
                                    const completionDate = myUnit[0].completionDate;
                                    const category = myUnit[0].category;

                                    if (completionDate !== undefined) {
                                        if (contractDate !== undefined) {
                                            option = {
                                                unitId,
                                                value: 0,
                                                text: "",
                                                paymentType: "",
                                                memo: req.i18n.t('payment.paymentOptions.memo.memo2'),
                                                action: "",
                                                actionText: ""
                                            }
                                        }
                                        else {
                                            option = {
                                                unitId,
                                                value: 0,
                                                text: "",
                                                paymentType: "",
                                                memo: req.i18n.t('payment.paymentOptions.memo.memo1'),
                                                action: "go",
                                                actionText: req.i18n.t('payment.paymentOptions.action.go')
                                            }
                                        }
                                    }
                                    else if (contractDate !== undefined) {
                                        option = {
                                            unitId,
                                            value: 0,
                                            text: "",
                                            paymentType: "",
                                            memo: req.i18n.t('payment.paymentOptions.memo.memo3'),
                                            action: "",
                                            actionText: ""
                                        }
                                    }
                                    else if (contractingDate !== undefined) {
                                        if (category !== undefined) {
                                            const myUnit = user.units.filter((item) => item.id === unitId);
                                            const category = myUnit[0].category;
                                            const priceDetails = myUnit[0].priceDetails.filter((item) => item.category === category);
                                            const cashAmount = priceDetails[0].cashAmount;
                                            const totalPayments = user.payments.filter((item) => item.unitId === unitId);
                                            const paidTotal = totalPayments.reduce((sum, item) => sum + Number(item.amount), 0);
                                            const cashingValue = cashAmount - paidTotal;
                                            const cashingText = paidTotal > (bookingAmount + contractingAmount) ? req.i18n.t('payment.paymentOptions.cashingAmountRest')
                                                : req.i18n.t('payment.paymentOptions.cashingAmount');
                                            option = {
                                                unitId,
                                                value: cashingValue,
                                                text: cashingText,
                                                paymentType: "cashing",
                                                memo: "",
                                                action: "pay",
                                                actionText: req.i18n.t('payment.paymentOptions.action.pay')
                                            }
                                        }
                                        else {
                                            option = {
                                                unitId,
                                                value: 0,
                                                text: "",
                                                paymentType: "",
                                                memo: req.i18n.t('payment.paymentOptions.memo.memo4'),
                                                action: "select",
                                                actionText: req.i18n.t('payment.paymentOptions.action.select')
                                            }
                                        }
                                    }
                                    else {
                                        const contractingPayments = user.payments.filter((item) =>
                                            item.unitId === unitId && item.paymentType === 'contracting'
                                        );
                                        const paidContracting = contractingPayments.reduce((sum, item) => sum + Number(item.amount), 0);
                                        const contractingValue = contractingAmount - paidContracting;
                                        const contractingText = paidContracting > 0 ? req.i18n.t('payment.paymentOptions.contractingAmountRest')
                                            : req.i18n.t('payment.paymentOptions.contractingAmount');
                                        option = {
                                            unitId,
                                            value: contractingValue,
                                            text: contractingText,
                                            paymentType: "contracting",
                                            memo: "",
                                            action: "pay",
                                            actionText: req.i18n.t('payment.paymentOptions.action.pay')
                                        }
                                    }
                                    paymentOptions.push(option);
                                }
                            })
                        }
                        const bookingValue = bookingAmount - paidBooking;
                        const bookingText = paidBooking > 0 ? req.i18n.t('payment.paymentOptions.bookingAmountRest')
                            : req.i18n.t('payment.paymentOptions.bookingAmount');
                        option = {
                            unitId: "",
                            value: bookingValue,
                            text: bookingText,
                            paymentType: "booking",
                            memo: "",
                            action: "pay",
                            actionText: req.i18n.t('payment.paymentOptions.action.pay')
                        }
                        paymentOptions.push(option);

                        res.status(200).json({
                            status: "success",
                            error: "",
                            message: {
                                paymentOptions
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

const getMyPayments = async (req, res) => {
    try {
        const {user: {id: userID}} = await req.body;

        User.findOne({_id: userID}, {payments: 1, units: 1, _id: 0})
            .then((user) => {
                user.payments.map((item) => {
                    item.paymentType = undefined;
                    item._doc.amount = Number(item.amount);
                    item._doc.paymentMethodText = req.i18n.t(`payment.method.${item.paymentMethod}`);
                });

                const bankChecks = [];
                user.units.forEach((unit) => {
                    const checks = [...unit.bankChecks];
                    checks.forEach((check) => {
                        check._doc.unitId = unit.id;
                        bankChecks.push(check);
                    })
                });
                bankChecks.map((check) => {
                    check.bankName = req.i18n.t(`payment.banks.${check.bankName}`);
                    check._doc.statusText = req.i18n.t(`payment.checkStatus.${check.status}`);
                    check.image = undefined;
                    check.userID = undefined;
                    check.date = undefined;
                })

                res.status(200).json({
                    status: "success",
                    error: "",
                    message: {
                        payments: user.payments,
                        bankChecks
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

const getMyUnits = async (req, res) => {
    try {
        const {user: {id: userID}} = await req.body;

        User.findOne({_id: userID}, {units: 1, payments: 1, _id: 0})
            .then((user) => {
                user.units.map((unit) => {
                    if (unit.unitNumber === undefined) {
                        unit.unitNumber = "---";
                    }
                    if (unit.category === undefined) {
                        unit.category = req.i18n.t(`product.noCategory`);
                        unit._doc.totalAmount = 0;
                        unit._doc.totalCashAmount = 0;
                        unit._doc.totalChecksAmount = 0;
                    }
                    else {
                        const paymentSubset = user.payments.filter((item) => item.unitId === unit.id);
                        const paidAmount = paymentSubset.reduce((sum, item) => sum + Number(item.amount), 0);
                        const category = unit.category;
                        const myCategory = unit.priceDetails.filter((item) => item.category === category);
                        const grossAmount = myCategory[0].grossAmount;
                        const cashAmount = myCategory[0].cashAmount;
                        unit._doc.totalCashAmount = paidAmount;
                        if (paidAmount >= cashAmount) {
                            unit._doc.totalAmount = cashAmount;
                            unit._doc.totalChecksAmount = 0;
                        }
                        else {
                            unit._doc.totalAmount = grossAmount;
                            if (unit.bankChecks.length > 0) {
                                unit._doc.totalChecksAmount = unit.bankChecks.reduce((sum, item) => sum + Number(item.amount), 0);
                            }
                            else {
                                unit._doc.totalChecksAmount = 0;
                            }
                        }
                        unit.category = req.i18n.t(`product.${unit.category}.name`);
                    }
                    if (unit.contractingDate === undefined) {
                        unit.contractingDate = "";
                    }
                    if (unit.contractDate === undefined) {
                        unit.contractDate = "";
                    }
                    unit.priceDetails = undefined;
                    unit.completionDate = undefined;
                    unit.bankChecks = undefined;
                })

                res.status(200).json({
                    status: "success",
                    error: "",
                    message: {
                        units: user.units
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

const getUnitTypes = async (req, res) => {
    try {
        const {user: {id: userID}, unitId} = await req.body;

        if (unitId === undefined) {
            return res.status(400).json({
                status: "failed",
                error: req.i18n.t('payment.invalidUnitId'),
                message: {}
            })
        }

        User.findOne({_id: userID}, {units: 1})
            .then((user) => {
                const myUnit = user.units.filter((item) => item.id === unitId);
                if (myUnit.length === 0) {
                    return res.status(400).json({
                        status: "failed",
                        error: req.i18n.t('payment.invalidUnitId'),
                        message: {}
                    })
                }
                const currentCategory = myUnit[0].category;

                const editedUnits = [];
                user.units[0].priceDetails.forEach((unit) => {
                    const editedUnit = {categoryName: req.i18n.t(`product.${unit.category}.name`), ...unit._doc};
                    editedUnits.push(editedUnit);
                })

                res.status(200).json({
                    status: "success",
                    error: "",
                    message: {
                        units: editedUnits,
                        currentCategory
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

const selectUnitType = async (req, res) => {
    try {
        const {user: {id: userID}, unitId, category} = await req.body;

        if (unitId === undefined) {
            return res.status(400).json({
                status: "failed",
                error: req.i18n.t('payment.invalidUnitId'),
                message: {}
            })
        }

        const categoryList = ['category1', 'category2', 'category3'];
        if (category === undefined || !categoryList.includes(category.toString().toLowerCase())) {
            return res.status(400).json({
                status: "failed",
                error: req.i18n.t('product.invalidCategory'),
                message: {}
            })
        }

        User.findOne({_id: userID}, {units: 1, payments: 1})
            .then(async (user) => {
                const paymentSubset = user.payments.filter((item) => item.unitId === unitId);
                if (paymentSubset.length === 0) {
                    return res.status(400).json({
                        status: "failed",
                        error: req.i18n.t('payment.invalidUnitId'),
                        message: {}
                    })
                }

                const myUnit = user.units.filter((item) => item.id === unitId);
                if (myUnit[0].contractingDate === undefined) {
                    return res.status(400).json({
                        status: "failed",
                        error: req.i18n.t('product.noContracting'),
                        message: {}
                    })
                }
                if (myUnit[0].contractDate !== undefined) {
                    return res.status(400).json({
                        status: "failed",
                        error: req.i18n.t('product.contractDone'),
                        message: {}
                    })
                }

                const myCategory = myUnit[0].category;
                if (myCategory !== undefined) {
                    const targetPrices = myUnit[0].priceDetails.filter((item) => item.category === category.toString().toLowerCase());
                    const targetCashAmount = targetPrices[0].cashAmount;
                    const paidAmount = paymentSubset.reduce((sum, item) => sum + Number(item.amount), 0);
                    if (paidAmount > targetCashAmount) {
                        return res.status(400).json({
                            status: "failed",
                            error: req.i18n.t('product.invalidSelection'),
                            message: {}
                        })
                    }
                }

                user.units.map((item) => {
                    if (item.id === unitId) item.category = category.toString().toLowerCase()
                });
                await user.save()
                    .then(() => {
                        res.status(200).json({
                            status: "success",
                            error: "",
                            message: {
                                category: category.toString().toLowerCase()
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

const updatePhoto = async (req, res) => {
    try {
        const region = process.env.S3_REGION;
        const accessKeyId = process.env.S3_ACCESS_KEY_ID;
        const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
        const bucket = process.env.S3_BUCKET;
        const client = new S3Client({region, credentials: {accessKeyId, secretAccessKey}});

        const {user: {id: userID}} = await req.body;
        const filesNumber = await req.files.length;
        if (filesNumber !== 1) {
            return res.status(400).json({
                status: "failed",
                error: req.i18n.t(`user.profilePhotoRequired`),
                message: {}
            })
        }

        const {fileTypeFromBuffer} = await import('file-type');
        const file = req.files[0];
        const type = await fileTypeFromBuffer(file.buffer);
        const ext = type['ext'].toString().toLowerCase();
        const imageTypes = Process.env.IMAGE_FILE_TYPE.split(',');
        if (!imageTypes.includes(ext)) {
            return res.status(400).json({
                status: "Failed",
                error: req.i18n.t(`user.notImageFile`),
                message: {
                    imageTypes
                }
            })
        }
        const width = Number(process.env.IMAGE_PROFILE_MAX_WIDTH);
        const {buffer} = await Image.compress(file.buffer, width);
        const fileStream = Readable.from(buffer);
        const fileKey = `users/${userID}/photos/profile.jpg`;
        const params = {Bucket: bucket, Key: fileKey, Body: fileStream, ACL: "public-read"};
        const upload = new Upload({
            client,
            params,
            tags: [], // optional tags
            queueSize: 4, // optional concurrency configuration
            partSize: 1024 * 1024 * 5, // optional size of each part, in bytes, at least 5MB
            leavePartsOnError: false, // optional manually handle dropped parts
        });
        upload.done()
            .then(() => {
                const profilePhoto = `https://s3.${region}.amazonaws.com/${bucket}/${fileKey}`;
                User.findOneAndUpdate({_id: userID}, {profilePhoto})
                    .then(() => {
                        res.status(200).json({
                            status: "success",
                            error: "",
                            message: {
                                profilePhoto
                            }
                        })
                    })
                    .catch((err) => {
                        res.status(500).json(
                            {
                                status: "failed",
                                error: req.i18n.t('user.imageSavingError'),
                                message: {
                                    info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
                                }
                            })
                    });
            })
            .catch((err) => {
                res.status(500).json(
                    {
                        status: "failed",
                        error: req.i18n.t('user.imageSavingError'),
                        message: {
                            info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
                        }
                    })
            });
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

const updateNationalId = async (req, res) => {
    try {
        const region = process.env.S3_REGION;
        const accessKeyId = process.env.S3_ACCESS_KEY_ID;
        const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
        const bucket = process.env.S3_BUCKET;
        const client = new S3Client({region, credentials: {accessKeyId, secretAccessKey}});

        const {user: {id: userID}} = await req.body;
        const filesNumber = await req.files.length;
        if (filesNumber !== 2) {
            return res.status(400).json({
                status: "failed",
                error: req.i18n.t(`user.idImagesRequired`),
                message: {}
            })
        }

        const {fileTypeFromBuffer} = await import('file-type');
        const IDs = [];

        const uploadFile = (file, index) => {
            return new Promise(async (myResolve, myReject) => {
                const type = await fileTypeFromBuffer(file.buffer);
                const ext = type['ext'].toString().toLowerCase();
                const imageTypes = Process.env.IMAGE_FILE_TYPE.split(',');
                if (!imageTypes.includes(ext)) {
                    return res.status(400).json({
                        status: "Failed",
                        error: req.i18n.t(`user.notImageFile`),
                        message: {
                            imageTypes
                        }
                    })
                }
                const width = Number(process.env.IMAGE_ID_MAX_WIDTH);
                const {buffer} = await Image.compress(file.buffer, width);
                const fileStream = Readable.from(buffer);
                const fileKey = `users/${userID}/identification/ID${index + 1}.jpg`;
                const params = {Bucket: bucket, Key: fileKey, Body: fileStream, ACL: "public-read"};
                const upload = new Upload({
                    client,
                    params,
                    tags: [], // optional tags
                    queueSize: 4, // optional concurrency configuration
                    partSize: 1024 * 1024 * 5, // optional size of each part, in bytes, at least 5MB
                    leavePartsOnError: false, // optional manually handle dropped parts
                });
                upload.done()
                    .then(() => {
                        IDs.push(`https://s3.${region}.amazonaws.com/${bucket}/${fileKey}`);
                        myResolve();
                    })
                    .catch((err) => {
                        myReject(err);
                    });
            })
        }

        uploadFile(req.files[0], 0)
            .then(() => {
                uploadFile(req.files[1], 1)
                    .then(() => {
                        const update = {'identification.nationalId.front': IDs[0], 'identification.nationalId.back': IDs[1]}
                        User.findOneAndUpdate({_id: userID}, {update})
                            .then(() => {
                                res.status(200).json({
                                    status: "success",
                                    error: "",
                                    message: {
                                        frontId: IDs[0],
                                        backId: IDs[1]
                                    }
                                })
                            })
                            .catch((err) => {
                                res.status(500).json(
                                    {
                                        status: "failed",
                                        error: req.i18n.t('user.imageSavingError'),
                                        message: {
                                            info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
                                        }
                                    })
                            });
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
    updateSuspension,
    checkUnitId,
    checkCategory,
    getUnitTypes,
    completePayment,
    getPaymentOptions,
    getMyPayments,
    getMyUnits,
    selectUnitType,
    updatePhoto,
    updateNationalId
}

