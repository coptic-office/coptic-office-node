const debug = require('debug');
const errorLog = debug('app-staff:error');
const Staff = require('../models/staff');
const auth = require("../middleware/auth");
const PreUser = require("../models/preUsers");
const User = require('../controllers/users');
const numbers = require("../utils/codeGenerator");
const sendSMS = require("../utils/smsConnectors");
const {createSmsRecord} = require("./smsRecords");
const crypto = require("crypto");
const Image = require('../utils/imageProcessing');
const {Readable} = require('stream');
const {S3Client} = require('@aws-sdk/client-s3');
const {Upload} = require("@aws-sdk/lib-storage");
const Process = require("process");
const {generateUUID} = require('../utils/codeGenerator');
const Payment = require('../controllers/payments');
const Check = require('../controllers/bankChecks');
const i18n = require('i18next');
const {isFloat, isNumeric} = require('../utils/numberUtils');

const addStaff = async (req, res) => {
    try {
        const bodyData = await req.body;
        let {firstName, lastName, mobile, email, jobTitle, password, role} = bodyData;

        if (firstName === undefined || lastName === undefined || mobile === undefined || email === undefined
            || jobTitle === undefined || password === undefined || role === undefined) {
            return res.status(400).json({
                status: "failed",
                error: req.i18n.t('register.missingData'),
                message: {}
            })
        }

        const country = mobile.country;
        bodyData.mobile['primary'] = {'number': mobile.number, country};
        bodyData.email = undefined;
        bodyData.email = {};
        bodyData.email.primary = email;

        await Staff.create(bodyData)
            .then((staff) => {
                if (!staff) {
                    return res.status(404).json({
                        status: "failed",
                        error: req.i18n.t('register.creationError'),
                        message: {}
                    })
                }

                staff = {...staff._doc, _id: undefined, __v: undefined, isActive: undefined};
                res.status(201).json({
                    status: "success",
                    error: "",
                    message: {
                        user: staff
                    }
                })
            })
            .catch((err) => {
                let resourceID = 'creationError';
                if (err.errors !== undefined) {
                    if (typeof err.errors.password != 'undefined') {
                        resourceID = err.errors.password.message;
                    } else if (typeof err.errors.role != 'undefined') {
                        resourceID = err.errors.role.message;
                    }
                }

                res.status(400)
                    .json({
                        status: "failed",
                        error: req.i18n.t(`register.${resourceID}`),
                        message: {}
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

const login = async (req, res) => {
    try {
        const {mobileNumber, password} = await req.body;
        if (mobileNumber === undefined) {
            return res.status(400)
                .json({
                    status: "failed",
                    error: req.i18n.t(`register.mobileRequired`),
                    message: {}
                })
        }

        const query = {'mobile.primary.number': mobileNumber};
        const projection = {firstName: 1, lastName: 1, password: 1, mobile: 1, profilePhoto: 1, role: 1, isActive: 1};
        Staff.findOne(query, projection)
            .then((staff) => {
                if (!staff) {
                    return res.status(404).json({
                        status: "failed",
                        error: req.i18n.t('login.userNotFound'),
                        message: {}
                    })
                }
                let {isSuspended, login: {failedTrials, nextTrial}} = staff.isActive;
                if (isSuspended) {
                    return res.status(403).json({
                        status: "failed",
                        error: req.i18n.t('restriction.suspendedStaff'),
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
                staff.comparePassword(password, async (err, isMatch) => {
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
                            updateRestriction(staff._id, {failedTrials: 0})
                                .catch((err) => {
                                    errorLog(`Couldn't update staff restriction for staff: ${staff._id}. ${err.toString()}`);
                                })
                        }
                        const accessToken = auth.issueAccessToken(staff);
                        if (accessToken === 'Error') {
                            return res.status(500)
                                .json({
                                    status: "failed",
                                    error: req.i18n.t('security.signingError'),
                                    message: {}
                                })
                        }
                        const renewToken = await auth.issueRenewToken(staff)
                            .catch((err) => {
                                return res.status(500)
                                    .json({
                                        status: "failed",
                                        error: req.i18n.t('security.signingError'),
                                        message: {}
                                    })
                            })

                        staff = {...staff._doc,_id: undefined, __v: undefined, password: undefined, role: undefined, isActive: undefined};

                        res.status(200)
                            .json({
                                status: "success",
                                error: "",
                                message: {
                                    user: staff,
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
                        updateRestriction(staff._id, param)
                            .catch((err) => {
                                errorLog(`Couldn't update staff restriction for staff: ${staff._id}. ${err.toString()}`);
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

const updateRestriction = async (staffId, param) => {
    return new Promise((myResolve, myReject) => {
        const {isSuspended, failedTrials, nextTrial} = param;
        const update = {'isActive.isSuspended': isSuspended, 'isActive.login.failedTrials': failedTrials, 'isActive.login.nextTrial': nextTrial};
        Object.keys(update).forEach(key => update[key] === undefined ? delete update[key] : {});
        Staff.findOneAndUpdate({_id: staffId}, update, {projection: {_id: 0, isActive: 1}, new: true})
            .then((staff) => {
                myResolve(staff);
            })
            .catch((err) => {
                myReject(err);
            })
    })
}

const forgotPassword = async (req, res) => {
    try {
        const bodyData = await req.body;
        const {mobile} = bodyData;
        let mobileNumber = 'None';
        let country = 'None';

        if (mobile !== undefined) {
            mobileNumber = mobile.number;
            country = mobile.country;
            bodyData['otpReceiver'] = {'recipient': mobileNumber, country};
        }

        Staff.findOne({'mobile.primary.number': mobileNumber})
            .then(async (staff) => {
                if (staff) {
                    PreUser.findOne({'otpReceiver.recipient': bodyData.otpReceiver.recipient})
                        .then(async (preUser) => {
                            if (!preUser) {
                                const otp = numbers.generateNumber(Number(process.env.OTP_DIGITS_NUMBER));
                                bodyData.otp = otp
                                bodyData.action = 'PASSWORD'
                                await PreUser.create(bodyData)
                                    .then(async (preUser) => {
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
                                    })
                                    .catch((err) => {
                                        forgotPasswordError(req, res, err);
                                    })
                            }
                            else {
                                if (new Date() > preUser.otpRenewal) {
                                    const otp = numbers.generateNumber(Number(process.env.OTP_DIGITS_NUMBER));
                                    const renewalInterval = Number(process.env.OTP_RENEWAL_IN_HOURS) * (60 * 60 * 1000);
                                    const startingDelay = Number(process.env.OTP_SMS_STARTING_DELAY);
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
                                            await sendSMS(otp, mobileNumber, country)
                                                .then(({aggregator, price}) => {
                                                    logSMS(preUser._id, otp, mobileNumber, country, aggregator, price, 'Forgot Password');
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
                                                    forgotPasswordError(req, res, err);
                                                })
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
                                                    mobileNumber: preUser.otpReceiver.recipient,
                                                    otpSent: false,
                                                    info: req.i18n.t('user.mobileUsageSuspended'),
                                                    otpResend: preUser.otpRenewal
                                                }
                                            })
                                    }
                                    else {
                                        if (new Date() > preUser.otpResend) {
                                            const otp = preUser.otp;
                                            const smsDelayMultiplier = Number(process.env.OTP_SMS_DELAY_MULTIPLIER);
                                            const otpDelay = preUser.otpDelay * smsDelayMultiplier;
                                            const otpResend = new Date(new Date().getTime() + (otpDelay * 60 * 1000));
                                            await PreUser.updateOne({'otpReceiver.recipient': bodyData.otpReceiver.recipient},
                                                {
                                                    otpDelay,
                                                    otpResend,
                                                    action: 'PASSWORD'
                                                })
                                                .then(async () => {
                                                    await sendSMS(otp, mobileNumber, country)
                                                        .then(({aggregator, price}) => {
                                                            logSMS(preUser._id, otp, mobileNumber, country, aggregator, price, 'Forgot Password');
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
                                                            forgotPasswordError(req, res, err);
                                                        })
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
                                                        mobileNumber: bodyData.otpReceiver.recipient,
                                                        otpSent: false,
                                                        info: req.i18n.t('user.mobileUsageSuspended'),
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

const verifyOTP = async (req, res) => {
    try {
        const {mobileNumber, otp} = await req.body;

        PreUser.findOne({'otpReceiver.recipient': mobileNumber})
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
                            await PreUser.updateOne({'otpReceiver.recipient': mobileNumber}, {wrongTrials})
                            res.status(401)
                                .json({
                                    status: "failed",
                                    error: req.i18n.t('otp.incorrectOTP'),
                                    message: {}
                                })
                        }
                        else {
                            if (preUser.action === 'PASSWORD') {
                                const verificationCode = crypto.randomBytes(30).toString('hex');
                                await PreUser.updateOne({'otpReceiver.recipient': mobileNumber}, {verificationCode})
                                res.status(200)
                                    .json({
                                        status: "success",
                                        error: "",
                                        message: {
                                            mobileNumber,
                                            verificationCode
                                        }
                                    })
                            }
                            else {
                                res.status(404)
                                    .json({
                                        status: "failed",
                                        error: req.i18n.t('otp.recipientNotFound'),
                                        message: {}
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

const changePassword = async (req, res) => {
    try {
        const {user, oldPassword, newPassword, verificationCode, mobileNumber} = await req.body;
        if (user.role !== 'Guest') {
            if (oldPassword === newPassword) {
                return res.status(400)
                    .json({
                        status: "failed",
                        error: req.i18n.t('user.samePassword'),
                        message: {}
                    })
            }
            await Staff.findOne({_id: user.id}, {password: 1, isActive: 1})
                .then((staff) => {
                    const {isActive: {isSuspended}} = staff;
                    if (isSuspended) {
                        return res.status(403).json({
                            status: "failed",
                            error: req.i18n.t('restriction.suspended'),
                            message: {}
                        })
                    }
                    staff.comparePassword(oldPassword, async (err, isMatch) => {
                        if (err) {
                            return actionError(req, res, err);
                        }
                        if (isMatch) {
                            staff.password = newPassword;
                            await staff.save()
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
            PreUser.findOne({'otpReceiver.recipient': mobileNumber})
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
                            Staff.findOne({'mobile.primary.number': mobileNumber})
                                .then(async (staff) => {
                                    staff.password = newPassword;
                                    await staff.save()
                                        .then(async () => {
                                            await preUser.deleteOne();
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

const updatePhoto = async (req, res) => {
    try {
        const region = process.env.S3_REGION;
        const accessKeyId = process.env.S3_ACCESS_KEY_ID;
        const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
        const bucket = process.env.S3_BUCKET;
        const client = new S3Client({region, credentials: {accessKeyId, secretAccessKey}});

        const {user: {id: staffID}} = await req.body;
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
        const fileKey = `staff/${staffID}/photos/profile.jpg`;
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
                Staff.updateOne({_id: staffID}, {profilePhoto})
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
                                error: req.i18n.t('user.fileSavingError'),
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
                        error: req.i18n.t('user.fileSavingError'),
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

const deletePhoto = async (req, res) => {
    try {
        const {user: {id: staffID}} = await req.body;

        const defaultPhoto = process.env.GENERAL_DEFAULT_PROFILE;
        Staff.updateOne({_id: staffID}, {profilePhoto: defaultPhoto})
            .then(() => {
                res.status(200).json({
                    status: "success",
                    error: "",
                    message: {
                        profilePhoto: defaultPhoto
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

const getUserDetails = async (req, res) => {
    try {
        const {mobile: {number: mobileNumber}} = await req.body;

        User.getUserDetails(mobileNumber)
            .then((user) => {
                const info = {};
                info.id = user._id;
                info.firstName = user.firstName;
                info.lastName = user.lastName;
                info.mobile = mobileNumber;
                info.email = user.email === undefined ? '' : user.email.primary;
                info.identification = user.identification === undefined ? {} : user.identification;
                info.status = user.isActive;

                let totalPayments = 0;
                user.payments.map((item) => {
                    item.paymentType = undefined;
                    totalPayments += Number(item.amount);
                    item._doc.amount = Number(item.amount);
                    item._doc.paymentMethodText = req.i18n.t(`payment.method.${item.paymentMethod}`);
                });

                const bankChecks = [];
                let totalChecks = 0;
                user.units.forEach((unit) => {
                    const checks = [...unit.bankChecks];
                    checks.forEach((check) => {
                        check._doc.unitId = unit.id;
                        totalChecks += Number(check.amount);
                        bankChecks.push(check);
                    })
                });
                bankChecks.map((check) => {
                    check.bankName = req.i18n.t(`payment.banks.${check.bankName}`);
                    check._doc.statusText = req.i18n.t(`payment.checkStatus.${check.status.current}`);
                })

                user.units.map((unit) => {
                    const paymentSubset = user.payments.filter((item) => item.unitId === unit.id);
                    const paidAmount = paymentSubset.reduce((sum, item) => sum + Number(item.amount), 0);
                    unit._doc.totalCashAmount = paidAmount;

                    if (unit.unitNumber === undefined) {
                        unit.unitNumber = "---";
                    }

                    if (unit.info.ar === undefined) {
                        unit.info = "";
                    }
                    else {
                        const lang = [req.i18n.t(`general.language`)];
                        unit._doc.info = unit.info[lang];
                    }

                    if (unit.category === undefined) {
                        unit.category = req.i18n.t(`product.noCategory`);
                        unit._doc.totalAmount = 0;
                        unit._doc.totalChecksAmount = 0;
                    }
                    else {
                        const category = unit.category;
                        const myCategory = unit.priceDetails.filter((item) => item.category === category);
                        const grossAmount = myCategory[0].grossAmount;
                        const cashAmount = myCategory[0].cashAmount;
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

                    if (unit.completionDate === undefined) {
                        unit.completionDate = "";
                    }

                    unit.priceDetails = undefined;
                    unit.bankChecks = undefined;
                })

                res.status(200).json({
                    status: "success",
                    error: "",
                    message: {
                        info,
                        payments: user.payments,
                        totalPayments,
                        bankChecks,
                        totalChecks,
                        units: user.units
                    }
                })

            })
            .catch((err) => {
                if (err === 'userNotFound') {
                    res.status(404).json({
                        status: "failed",
                        error: req.i18n.t('login.userNotFound'),
                        message: {}
                    })
                } else {
                    res.status(500).json(
                        {
                            status: "failed",
                            error: req.i18n.t('general.internalError'),
                            message: {
                                info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
                            }
                        })
                }
            })
    } catch (err) {
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

const addPayment = async (req, res) => {
    try {
        const {user: {id: staffID}, id, unitId, paymentType, paymentMethod, amount, adviceDate, transactionNumber, comments} = await req.body;
        const paymentTypeList = ['booking', 'contracting', 'cashing'];
        const paymentMethodList = ['bankDeposit', 'bankTransfer', 'instaPay', 'creditCard'];

        if (paymentMethod === undefined || amount === undefined || adviceDate === undefined ||
            transactionNumber === undefined || comments === undefined) {
            return res.status(400).json({
                status: "failed",
                error: req.i18n.t('payment.missingData'),
                message: {}
            });
        }

        if (!paymentMethodList.includes(paymentMethod)) {
            return res.status(400).json({
                status: "failed",
                error: req.i18n.t('payment.invalidMethod'),
                message: {}
            });
        }

        if (new Date(adviceDate) == 'Invalid Date') {
            return res.status(400).json({
                status: "failed",
                error: req.i18n.t('payment.invalidDate'),
                message: {}
            });
        }

        if (!isFloat(amount)) {
            return res.status(400).json({
                status: "failed",
                error: req.i18n.t('payment.invalidAmount'),
                message: {}
            });
        }

        if (transactionNumber.split('@').length === 2) {
            if (transactionNumber.split('@')[0].length <= 3) {
                return res.status(400).json({
                    status: "failed",
                    error: req.i18n.t('payment.invalidTransaction'),
                    message: {}
                });
            }
        }

        let isCompletePayment = false;
        const uniqueId = generateUUID();
        const paymentData = {};
        paymentData.receiptDetails = {};
        paymentData.receiptDetails.items = [];
        paymentData.receiptDetails.items[0] = {};
        paymentData.paymentDetails = {};

        if (id !== undefined && unitId !== undefined && paymentType !== undefined) {
            if (!paymentTypeList.includes(paymentType.toString().toLowerCase())) {
                return res.status(400).json({
                    status: "failed",
                    error: req.i18n.t('payment.invalidType'),
                    message: {}
                });
            }

            if (!id.match(/^[0-9a-fA-F]{24}$/)) {
                return res.status(400).json(
                    {
                        status: "failed",
                        error: req.i18n.t('payment.incorrectUserID'),
                        message: {}
                    })
            }

            const user = await User.getUserById(id, {firstName: 1, lastName: 1, 'mobile.primary': 1, units: 1});

            if (!user) {
                return res.status(400).json(
                    {
                        status: "failed",
                        error: req.i18n.t('payment.incorrectUserID'),
                        message: {}
                    })
            }

            if (unitId !== '') {
                const myUnit = user.units.filter((unit) => unit.id === unitId);

                if (myUnit[0] === undefined) {
                    return res.status(500).json(
                        {
                            status: "failed",
                            error: req.i18n.t('payment.invalidUnitId'),
                            message: {}
                        })
                }

                if (myUnit[0].contractingDate === undefined) {
                    if (paymentType.toString().toLowerCase() !== 'contracting') {
                        return res.status(400).json(
                            {
                                status: "failed",
                                error: req.i18n.t('payment.incorrectType'),
                                message: {}
                            })
                    }
                }
                else if (myUnit[0].contractDate !== undefined || myUnit[0].completionDate !== undefined) {
                    return res.status(400).json(
                        {
                            status: "failed",
                            error: req.i18n.t('payment.incorrectType'),
                            message: {}
                        })
                }
                else if (myUnit[0].category === undefined) {
                    return res.status(400).json(
                        {
                            status: "failed",
                            error: req.i18n.t('payment.incorrectType'),
                            message: {}
                        })
                }
                else if (paymentType.toString().toLowerCase() !== 'cashing') {
                    return res.status(400).json(
                        {
                            status: "failed",
                            error: req.i18n.t('payment.incorrectType'),
                            message: {}
                        })
                }
            }
            else {
                if (paymentType.toString().toLowerCase() !== 'booking') {
                    return res.status(400).json(
                        {
                            status: "failed",
                            error: req.i18n.t('payment.incorrectType'),
                            message: {}
                        })
                }
            }

            paymentData.userName = `${user.firstName} ${user.lastName}`;
            paymentData.mobile = user.mobile.primary;

            const itemDescription = req.i18n.t(`item.${paymentType.toString().toLowerCase()}`);
            isCompletePayment = true;

            paymentData.userID = id;
            paymentData.unitId = unitId;
            paymentData.paymentType = paymentType.toString().toLowerCase();
            paymentData.receiptDetails.items[0].name = itemDescription;
        }

        paymentData.receiptDetails.transactionNumber = uniqueId;
        paymentData.receiptDetails.items[0].price = amount;
        paymentData.receiptDetails.amount = amount;
        paymentData.paymentDetails.paymentMethod = paymentMethod;
        paymentData.paymentDetails.locale = 'ar';
        paymentData.paymentDetails.amount = amount;
        paymentData.paymentDetails.date = new Date();
        paymentData.paymentDetails.adviceDate = new Date(adviceDate);
        paymentData.paymentDetails.transactionNumber = transactionNumber;
        paymentData.paymentDetails.status = 'Succeeded';
        paymentData.paymentDetails.comments = comments;
        paymentData.paymentDetails.staffID = staffID;

        Payment.addPayment(paymentData)
            .then(({paymentId}) => {
                if (isCompletePayment) {
                    const paymentData = {
                        userID: id,
                        id: paymentId,
                        paymentType: paymentType.toString().toLowerCase(),
                        paymentMethod: paymentMethod,
                        amount,
                        adviceDate: new Date(adviceDate),
                        unitId,
                        locale: 'ar'
                    }
                    User.completePayment(paymentData)
                        .then(() => {
                            res.status(200).json({
                                status: "success",
                                error: "",
                                message: {}
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
                        });
                }
                else {
                    res.status(200).json({
                        status: "success",
                        error: "",
                        message: {}
                    })
                }
            })
            .catch((err) => {
                if (err.toString() === 'repeatedTransaction') {
                    res.status(400).json({
                        status: "failed",
                        error: req.i18n.t('payment.repeatedTransaction'),
                        message: {}
                    })
                }
                else {
                    res.status(500).json(
                        {
                            status: "failed",
                            error: req.i18n.t('general.internalError'),
                            message: {
                                info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
                            }
                        })
                }
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

const linkPayment = async (req, res) => {
    try {
        const {user: {id: staffID}, id, unitId, paymentType, paymentMethod, transactionNumber} = await req.body;
        const paymentTypeList = ['booking', 'contracting', 'cashing'];

        if (paymentMethod === undefined || transactionNumber === undefined || id === undefined ||
            unitId === undefined || paymentType === undefined) {
            return res.status(400).json({
                status: "failed",
                error: req.i18n.t('payment.missingData'),
                message: {}
            });
        }

        if (!paymentTypeList.includes(paymentType.toString().toLowerCase())) {
            return res.status(400).json({
                status: "failed",
                error: req.i18n.t('payment.invalidType'),
                message: {}
            });
        }

        if (!id.match(/^[0-9a-fA-F]{24}$/)) {
            return res.status(400).json(
                {
                    status: "failed",
                    error: req.i18n.t('payment.incorrectUserID'),
                    message: {}
                })
        }

        const user = await User.getUserById(id, {firstName: 1, lastName: 1, 'mobile.primary': 1, units: 1});

        if (!user) {
            return res.status(400).json(
                {
                    status: "failed",
                    error: req.i18n.t('payment.incorrectUserID'),
                    message: {}
                })
        }

        if (unitId !== '') {
            const myUnit = user.units.filter((unit) => unit.id === unitId);

            if (myUnit[0] === undefined) {
                return res.status(500).json(
                    {
                        status: "failed",
                        error: req.i18n.t('payment.invalidUnitId'),
                        message: {}
                    })
            }

            if (myUnit[0].contractingDate === undefined) {
                if (paymentType.toString().toLowerCase() !== 'contracting') {
                    return res.status(400).json(
                        {
                            status: "failed",
                            error: req.i18n.t('payment.incorrectType'),
                            message: {}
                        })
                }
            }
            else if (myUnit[0].contractDate !== undefined || myUnit[0].completionDate !== undefined) {
                return res.status(400).json(
                    {
                        status: "failed",
                        error: req.i18n.t('payment.incorrectType'),
                        message: {}
                    })
            }
            else if (paymentType.toString().toLowerCase() !== 'cashing') {
                return res.status(400).json(
                    {
                        status: "failed",
                        error: req.i18n.t('payment.incorrectType'),
                        message: {}
                    })
            }
        }
        else {
            if (paymentType.toString().toLowerCase() !== 'booking') {
                return res.status(400).json(
                    {
                        status: "failed",
                        error: req.i18n.t('payment.incorrectType'),
                        message: {}
                    })
            }
        }

        const userID = id;
        const userName = `${user.firstName} ${user.lastName}`;
        const mobile = user.mobile.primary;
        const itemDescription = req.i18n.t(`item.${paymentType.toString().toLowerCase()}`);
        const paymentData = {transactionNumber, paymentMethod, userID, userName, mobile, unitId, paymentType, itemDescription, staffID};

        Payment.updatePayment(paymentData)
            .then(({paymentId, amount, adviceDate}) => {
                const paymentData = {
                    userID,
                    id: paymentId,
                    paymentType: paymentType.toString().toLowerCase(),
                    paymentMethod,
                    amount,
                    adviceDate,
                    unitId
                }
                User.completePayment(paymentData)
                    .then(() => {
                        res.status(200).json({
                            status: "success",
                            error: "",
                            message: {}
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
                    });
            })
            .catch((err) => {
                if (err.toString() === 'noPaymentFound') {
                    return res.status(400).json(
                        {
                            status: "failed",
                            error: req.i18n.t('payment.noPaymentFound'),
                            message: {}
                        })
                }
                else if (err.toString() === 'paymentLinked') {
                    return res.status(400).json(
                        {
                            status: "failed",
                            error: req.i18n.t('payment.paymentLinked'),
                            message: {}
                        })
                }
                else {
                    res.status(500).json(
                        {
                            status: "failed",
                            error: req.i18n.t('general.internalError'),
                            message: {
                                info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
                            }
                        })
                }
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

const findPayment = async (req, res) => {
    try {
        const {referenceNumber} = await req.body;

        if (referenceNumber === undefined) {
            return res.status(400).json({
                status: "failed",
                error: req.i18n.t('payment.missingData'),
                message: {}
            });
        }

        if (!referenceNumber.match(/^[0-9a-fA-F]{24}$/)) {
            return res.status(400).json(
                {
                    status: "failed",
                    error: req.i18n.t('payment.noPaymentFound'),
                    message: {}
                })
        }

        Payment.findPaymentByRef(referenceNumber)
            .then((payment) => {
                const paymentData = {};
                paymentData.id = payment._id;
                paymentData.userName = payment.userName;
                paymentData.mobile = payment.mobile;
                paymentData.unitId = payment.unitId;
                paymentData.paymentType = i18n.t(`payment.paymentOptions.${payment.paymentType}Amount`, {lng: 'ar'});
                paymentData.paymentMethod = i18n.t(`payment.method.${payment.paymentDetails.paymentMethod}`, {lng: 'ar'});
                paymentData.amount = Number(payment.paymentDetails.amount);
                paymentData.status = i18n.t(`payment.paymentStatus.${payment.paymentDetails.status}`, {lng: 'ar'});
                paymentData.date = payment.paymentDetails.adviceDate;
                paymentData.transactionNumber = payment.paymentDetails.transactionNumber !== undefined ?
                    payment.paymentDetails.transactionNumber : payment.receiptDetails.transactionNumber;
                paymentData.comments = payment.paymentDetails.comments;

                res.status(200).json({
                    status: "success",
                    error: "",
                    message: {
                        paymentData
                    }
                })
            })
            .catch((err) => {
                if (err.toString() === 'noPaymentFound') {
                    return res.status(400).json(
                        {
                            status: "failed",
                            error: req.i18n.t('payment.noPaymentFound'),
                            message: {}
                        })
                }
                else {
                    res.status(500).json(
                        {
                            status: "failed",
                            error: req.i18n.t('general.internalError'),
                            message: {
                                info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
                            }
                        })
                }
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

const findTransaction = async (req, res) => {
    try {
        const {transactionNumber, paymentMethod} = await req.body;
        const paymentMethodList = ['bankDeposit', 'bankTransfer', 'instaPay', 'creditCard'];

        if (transactionNumber === undefined || paymentMethod === undefined) {
            return res.status(400).json({
                status: "failed",
                error: req.i18n.t('payment.missingData'),
                message: {}
            });
        }

        if (!paymentMethodList.includes(paymentMethod)) {
            return res.status(400).json({
                status: "failed",
                error: req.i18n.t('payment.invalidMethod'),
                message: {}
            });
        }

        Payment.findTransaction(transactionNumber, paymentMethod)
            .then(({id, amount, date}) => {
                res.status(200).json({
                    status: "success",
                    error: "",
                    message: {
                        id,
                        amount,
                        date
                    }
                })
            })
            .catch((err) => {
                if (err.toString() === 'noPaymentFound') {
                    return res.status(400).json(
                        {
                            status: "failed",
                            error: req.i18n.t('payment.noPaymentFound'),
                            message: {}
                        })
                }
                else if (err.toString() === 'paymentLinked') {
                    return res.status(400).json(
                        {
                            status: "failed",
                            error: req.i18n.t('payment.paymentLinked'),
                            message: {}
                        })
                }
                else {
                    res.status(500).json(
                        {
                            status: "failed",
                            error: req.i18n.t('general.internalError'),
                            message: {
                                info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
                            }
                        })
                }
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

const addBankCheck = async (req, res) => {
    try {
        const region = process.env.S3_REGION;
        const accessKeyId = process.env.S3_ACCESS_KEY_ID;
        const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
        const bucket = process.env.S3_BUCKET;
        const client = new S3Client({region, credentials: {accessKeyId, secretAccessKey}});

        const {user: {id: staffID}, id, unitId, number, dueDate, amount, bankName} = await req.body;
        const filesNumber = await req.files.length;

        if (filesNumber !== 1) {
            return res.status(400).json({
                status: "failed",
                error: req.i18n.t(`user.checkPhotoRequired`),
                message: {}
            })
        }

        if (id === undefined || unitId === undefined || number === undefined || dueDate === undefined ||
            amount === undefined || bankName === undefined) {
            return res.status(400).json({
                status: "failed",
                error: req.i18n.t('payment.missingCheckData'),
                message: {}
            });
        }

        if (new Date(dueDate) == 'Invalid Date') {
            return res.status(400).json({
                status: "failed",
                error: req.i18n.t('payment.invalidDate'),
                message: {}
            });
        }

        if (!isFloat(amount)) {
            return res.status(400).json({
                status: "failed",
                error: req.i18n.t('payment.invalidAmount'),
                message: {}
            });
        }

        if (!isNumeric(number)) {
            return res.status(400).json({
                status: "failed",
                error: req.i18n.t('payment.invalidNumber'),
                message: {}
            });
        }

        if (!id.match(/^[0-9a-fA-F]{24}$/)) {
            return res.status(400).json(
                {
                    status: "failed",
                    error: req.i18n.t('payment.incorrectUserID'),
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
        const arabicBankName = i18n.t(`payment.banks.${bankName}`, {lng: 'ar'});
        const width = Number(process.env.IMAGE_CHECK_MAX_WIDTH);
        const {buffer} = await Image.compress(file.buffer, width);
        const fileStream = Readable.from(buffer);
        const fileKey = `users/${id}/checks/${arabicBankName}_${number}.jpg`;
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
                const checkUrl = `https://s3.${region}.amazonaws.com/${bucket}/${fileKey}`;
                const checkData = {};
                checkData.userID = id;
                checkData.unitId = unitId;
                checkData.number = number;
                checkData.dueDate = new Date(dueDate);
                checkData.amount = amount;
                checkData.bankName = bankName;
                checkData.status = {};
                checkData.status.current = 'outstanding';
                checkData.status.adviceDate = new Date(dueDate);
                checkData.status.history = [];
                checkData.status.history.push({status: 'outstanding', staffID, adviceDate: new Date(dueDate), date: new Date()});
                checkData.image  = checkUrl;

                User.addBankCheck(checkData)
                    .then(({userName, mobile}) => {
                        checkData.userName = userName;
                        checkData.mobile = mobile;
                        checkData.unitId = unitId;
                        checkData.userID = id;

                        Check.addBankCheck(checkData)
                            .then(async (result) => {
                                if (result === 'repeatedCheck') {
                                    await User.removeBankCheck(checkData);
                                    return res.status(400).json({
                                        status: "failed",
                                        error: req.i18n.t(`payment.repeatedCheck`),
                                        message: {}
                                    })
                                }
                                res.status(200).json({
                                    status: "success",
                                    error: "",
                                    message: {}
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
                            });
                    })
                    .catch((err) => {
                        if (err.toString() === 'incorrectUserID') {
                            return res.status(400).json({
                                status: "failed",
                                error: req.i18n.t(`payment.incorrectUserID`),
                                message: {}
                            })
                        }
                        else if (err.toString() === 'invalidUnitId') {
                            return res.status(400).json({
                                status: "failed",
                                error: req.i18n.t(`payment.invalidUnitId`),
                                message: {}
                            })
                        }
                        else if (err.toString() === 'noBankCheck') {
                            return res.status(400).json({
                                status: "failed",
                                error: req.i18n.t(`payment.noBankCheck`),
                                message: {}
                            })
                        }
                        else if (err.toString() === 'repeatedCheck') {
                            return res.status(400).json({
                                status: "failed",
                                error: req.i18n.t(`payment.repeatedCheck`),
                                message: {}
                            })
                        }
                        else if (err.toString() === 'noChecksNeeded') {
                            return res.status(400).json({
                                status: "failed",
                                error: req.i18n.t(`payment.noChecksNeeded`),
                                message: {}
                            })
                        }
                        else if (err.toString() === 'noMoreChecks') {
                            return res.status(400).json({
                                status: "failed",
                                error: req.i18n.t(`payment.noMoreChecks`),
                                message: {}
                            })
                        }
                        else {
                            res.status(500).json(
                                {
                                    status: "failed",
                                    error: req.i18n.t('general.internalError'),
                                    message: {
                                        info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
                                    }
                                })
                        }
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

const findBankCheck = async (req, res) => {
    try {
        const {bankName, number} = await req.body;

        if (bankName === undefined || number === undefined) {
            return res.status(400).json({
                status: "failed",
                error: req.i18n.t('payment.missingCheckData'),
                message: {}
            });
        }

        Check.findBankCheck({bankName, number})
            .then((check) => {
                check.bankName = req.i18n.t(`payment.banks.${check.bankName}`);
                check._doc.statusText = req.i18n.t(`payment.checkStatus.${check.status.current}`);

                res.status(200).json({
                    status: "success",
                    error: "",
                    message: {
                        check
                    }
                })
            })
            .catch((err) => {
                if (err.toString() === 'checkNotFound') {
                    res.status(404).json({
                        status: "failed",
                        error: req.i18n.t('payment.checkNotFound'),
                        message: {}
                    })
                }
                else {
                    res.status(500).json(
                        {
                            status: "failed",
                            error: req.i18n.t('general.internalError'),
                            message: {
                                info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
                            }
                        })
                }
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

const updateCheckStatus = async (req, res) => {
    try {
        const {user: {id: staffID}, bankName, number, newStatus, adviceDate} = await req.body;
        const statusList = ['outstanding', 'cleared', 'rejected', 'cashed'];

        if (adviceDate === undefined || new Date(adviceDate) == 'Invalid Date') {
            return res.status(400).json({
                status: "failed",
                error: req.i18n.t('payment.invalidAdviceDate'),
                message: {}
            })
        }

        if (newStatus === undefined || !statusList.includes(newStatus.toString().toLowerCase())) {
            return res.status(400).json({
                status: "failed",
                error: req.i18n.t('payment.checkInvalidStatus'),
                message: {}
            })
        }

        Check.updateCheckStatus({staffID, bankName, number, newStatus, adviceDate})
            .then(({userID, unitId}) => {
                const updateData = {staffID, bankName, number, newStatus, adviceDate, userID, unitId};

                User.updateCheckStatus(updateData)
                    .then(() => {
                        res.status(200).json({
                            status: "success",
                            error: "",
                            message: {}
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
                if (err.toString() === 'checkNotFound') {
                    res.status(404).json({
                        status: "failed",
                        error: req.i18n.t('payment.checkNotFound'),
                        message: {}
                    })
                }
                else {
                    res.status(500).json(
                        {
                            status: "failed",
                            error: req.i18n.t('general.internalError'),
                            message: {
                                info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
                            }
                        })
                }
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

const getUnitTypes = async (req, res) => {
    try {
        const {id, unitId} = await req.body;

        if (id === undefined || unitId === undefined) {
            return res.status(400).json({
                status: "failed",
                error: req.i18n.t('register.missingData'),
                message: {}
            });
        }

        if (!id.match(/^[0-9a-fA-F]{24}$/)) {
            return res.status(400).json(
                {
                    status: "failed",
                    error: req.i18n.t('payment.incorrectUserID'),
                    message: {}
                })
        }

        User.findUnitTypes(id, unitId)
            .then(({units, currentCategory}) => {
                res.status(200).json({
                    status: "success",
                    error: "",
                    message: {
                        units,
                        currentCategory
                    }
                })
            })
            .catch((err) => {
                if (err.toString() === 'incorrectUserID') {
                    return res.status(400).json(
                        {
                            status: "failed",
                            error: req.i18n.t('payment.incorrectUserID'),
                            message: {}
                        })
                }
                else if (err.toString() === 'invalidUnitId') {
                    return res.status(400).json(
                        {
                            status: "failed",
                            error: req.i18n.t('payment.invalidUnitId'),
                            message: {}
                        })
                }
                else {
                    res.status(500).json(
                        {
                            status: "failed",
                            error: req.i18n.t('general.internalError'),
                            message: {
                                info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
                            }
                        })
                }
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

const selectUnitType = async (req, res) => {
    try {
        const {id, unitId, category} = await req.body;

        const categoryList = ['category1', 'category2', 'category3'];
        if (category === undefined || !categoryList.includes(category.toString().toLowerCase())) {
            return res.status(400).json({
                status: "failed",
                error: req.i18n.t('product.invalidCategory'),
                message: {}
            })
        }

        if (id === undefined || unitId === undefined) {
            return res.status(400).json({
                status: "failed",
                error: req.i18n.t('register.missingData'),
                message: {}
            });
        }

        if (!id.match(/^[0-9a-fA-F]{24}$/)) {
            return res.status(400).json(
                {
                    status: "failed",
                    error: req.i18n.t('payment.incorrectUserID'),
                    message: {}
                })
        }

        User.chooseUnitType(id, unitId, category.toString().toLowerCase())
            .then((category) => {
                res.status(200).json({
                    status: "success",
                    error: "",
                    message: {
                        category
                    }
                })
            })
            .catch((err) => {
                if (err.toString() === 'incorrectUserID') {
                    return res.status(400).json(
                        {
                            status: "failed",
                            error: req.i18n.t('payment.incorrectUserID'),
                            message: {}
                        })
                }
                else if (err.toString() === 'invalidUnitId') {
                    return res.status(400).json(
                        {
                            status: "failed",
                            error: req.i18n.t('payment.invalidUnitId'),
                            message: {}
                        })
                }
                else if (err.toString() === 'noContracting') {
                    return res.status(400).json(
                        {
                            status: "failed",
                            error: req.i18n.t('product.noContracting'),
                            message: {}
                        })
                }
                else if (err.toString() === 'contractDone') {
                    return res.status(400).json(
                        {
                            status: "failed",
                            error: req.i18n.t('product.contractDone'),
                            message: {}
                        })
                }
                else {
                    res.status(500).json(
                        {
                            status: "failed",
                            error: req.i18n.t('general.internalError'),
                            message: {
                                info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
                            }
                        })
                }
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

const addContract = async (req, res) => {
    try {
        const region = process.env.S3_REGION;
        const accessKeyId = process.env.S3_ACCESS_KEY_ID;
        const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
        const bucket = process.env.S3_BUCKET;
        const client = new S3Client({region, credentials: {accessKeyId, secretAccessKey}});

        const {user: {id: staffID}, id, unitId, unitNumber, contractDate} = await req.body;
        const filesNumber = await req.files.length;
        if (filesNumber !== 1) {
            return res.status(400).json({
                status: "failed",
                error: req.i18n.t(`user.contractFileRequired`),
                message: {}
            })
        }

        if (id === undefined || unitId === undefined || unitNumber === undefined || contractDate === undefined) {
            return res.status(400).json({
                status: "failed",
                error: req.i18n.t('payment.missingContractData'),
                message: {}
            });
        }

        if (!id.match(/^[0-9a-fA-F]{24}$/)) {
            return res.status(400).json(
                {
                    status: "failed",
                    error: req.i18n.t('payment.incorrectUserID'),
                    message: {}
                });
        }

        if (new Date(contractDate) == 'Invalid Date') {
            return res.status(400).json({
                status: "failed",
                error: req.i18n.t('payment.invalidDate'),
                message: {}
            });
        }

        const unitCodeList = ['أ', 'ب', 'ج', 'د'];
        const unitCodeMatchList = ['A', 'B', 'C', 'D'];
        let validUnitNumber = false;
        let unitNumberMatch;
        unitCodeList.forEach((code, index) => {
            if (unitNumber.includes(code)) {
                validUnitNumber = true;
                unitNumberMatch = unitNumber.replace(code, unitCodeMatchList[index]);
                unitNumberMatch = unitNumberMatch.replace('/', '-');
                unitNumberMatch = unitNumberMatch.replace(' ', '');
            }
        });
        if (!validUnitNumber) {
            return res.status(400).json(
                {
                    status: "failed",
                    error: req.i18n.t('payment.invalidUnitNumber'),
                    message: {}
                });
        }

        const {fileTypeFromBuffer} = await import('file-type');
        const file = req.files[0];
        const type = await fileTypeFromBuffer(file.buffer);
        const ext = type['ext'].toString().toLowerCase();
        if (ext !== 'pdf') {
            return res.status(400).json({
                status: "Failed",
                error: req.i18n.t(`user.notPdfFile`),
                message: {}
            })
        }

        const fileStream = Readable.from(file.buffer);
        let uploadDateTime = new Date();
        uploadDateTime = uploadDateTime.replace(' (Coordinated Universal Time)', '');
        const fileKey = `users/${id}/contract/${unitNumberMatch}${uploadDateTime}.pdf`;
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
            .then(async () => {
                const contractUrl = `https://s3.${region}.amazonaws.com/${bucket}/${fileKey}`;
                const contractData = {id, unitId, unitNumber, contractDate, contractUrl, staffID};

                await User.addContract(contractData);

                return res.status(200).json({
                    status: "success",
                    error: "",
                    message: {}
                })
            })
            .catch((err) => {
                if (err.toString() === 'incorrectUserID') {
                    return res.status(400).json({
                        status: "failed",
                        error: req.i18n.t(`payment.incorrectUserID`),
                        message: {}
                    })
                }
                else if (err.toString() === 'invalidUnitId') {
                    return res.status(400).json({
                        status: "failed",
                        error: req.i18n.t(`payment.invalidUnitId`),
                        message: {}
                    })
                }
                else if (err.toString() === 'noContract') {
                    return res.status(400).json({
                        status: "failed",
                        error: req.i18n.t(`payment.noContract`),
                        message: {}
                    })
                }
                else {
                    res.status(500).json(
                        {
                            status: "failed",
                            error: req.i18n.t('user.fileSavingError'),
                            message: {
                                info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
                            }
                        })
                }
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

const createPaymentsReport = async (req, res) => {
    try {
        let {fromDate, toDate} = await req.body;

        if (new Date(fromDate) == 'Invalid Date' || new Date(toDate) == 'Invalid Date') {
            return res.status(400).json({
                status: "failed",
                error: req.i18n.t('payment.invalidDate'),
                message: {}
            });
        }

        fromDate = new Date(fromDate);
        toDate = new Date(new Date(toDate).getTime() + (24 * 60 * 60 * 1000));

        Payment.createPaymentsReport(fromDate, toDate)
            .then((payments) => {
                let cardBooking = 0, cardContracting = 0, cardCashing = 0, cardTotal = 0, cardCount = 0;
                let depositBooking = 0, depositContracting = 0, depositCashing = 0, depositTotal = 0, depositCount = 0;
                let transferBooking = 0, transferContracting = 0, transferCashing = 0, transferTotal = 0, transferCount = 0;
                let instaBooking = 0, instaContracting = 0, instaCashing = 0, instaTotal = 0, instaCount = 0;
                const transList = [];

                payments.map((payment) => {
                    const method = payment.paymentDetails.paymentMethod.toString();
                    const type = payment.paymentType;
                    const amount = Number(payment.paymentDetails.amount);
                    let transNumber = undefined;
                    if (payment.paymentDetails.transactionNumber !== undefined) {
                        transNumber = payment.paymentDetails.transactionNumber.toString();
                    }

                    if (method === 'creditCard' && type === 'booking') {
                        cardBooking += amount;
                        cardTotal += amount;
                        cardCount++;
                    }
                    else if (method === 'creditCard' && type === 'contracting') {
                        cardContracting += amount;
                        cardTotal += amount;
                        cardCount++;
                    }
                    else if (method === 'creditCard' && type === 'cashing') {
                        cardCashing += amount;
                        cardTotal += amount;
                        cardCount++;
                    }
                    else if (method === 'bankDeposit' && type === 'booking') {
                        depositBooking += amount;
                        depositTotal += amount;
                        if (transNumber !== undefined && transNumber.split('@').length === 2) {
                            if (!transList.includes(transNumber.split('@')[0])) {
                                transList.push(transNumber.split('@')[0]);
                                depositCount++;
                            }
                        }
                        else {
                            depositCount++;
                        }
                    }
                    else if (method === 'bankDeposit' && type === 'contracting') {
                        depositContracting += amount;
                        depositTotal += amount;
                        if (transNumber !== undefined && transNumber.split('@').length === 2) {
                            if (!transList.includes(transNumber.split('@')[0])) {
                                transList.push(transNumber.split('@')[0]);
                                depositCount++;
                            }
                        }
                        else {
                            depositCount++;
                        }
                    }
                    else if (method === 'bankDeposit' && type === 'cashing') {
                        depositCashing += amount;
                        depositTotal += amount;
                        if (transNumber !== undefined && transNumber.split('@').length === 2) {
                            if (!transList.includes(transNumber.split('@')[0])) {
                                transList.push(transNumber.split('@')[0]);
                                depositCount++;
                            }
                        }
                        else {
                            depositCount++;
                        }
                    }
                    else if (method === 'bankTransfer' && type === 'booking') {
                        transferBooking += amount;
                        transferTotal += amount;
                        if (transNumber !== undefined && transNumber.split('@').length === 2) {
                            if (!transList.includes(transNumber.split('@')[0])) {
                                transList.push(transNumber.split('@')[0]);
                                transferCount++;
                            }
                        }
                        else {
                            transferCount++;
                        }
                    }
                    else if (method === 'bankTransfer' && type === 'contracting') {
                        transferContracting += amount;
                        transferTotal += amount;
                        if (transNumber !== undefined && transNumber.split('@').length === 2) {
                            if (!transList.includes(transNumber.split('@')[0])) {
                                transList.push(transNumber.split('@')[0]);
                                transferCount++;
                            }
                        }
                        else {
                            transferCount++;
                        }
                    }
                    else if (method === 'bankTransfer' && type === 'cashing') {
                        transferCashing += amount;
                        transferTotal += amount;
                        if (transNumber !== undefined && transNumber.split('@').length === 2) {
                            if (!transList.includes(transNumber.split('@')[0])) {
                                transList.push(transNumber.split('@')[0]);
                                transferCount++;
                            }
                        }
                        else {
                            transferCount++;
                        }
                    }
                    else if (method === 'instaPay' && type === 'booking') {
                        instaBooking += amount;
                        instaTotal += amount;
                        if (transNumber !== undefined && transNumber.split('@').length === 2) {
                            if (!transList.includes(transNumber.split('@')[0])) {
                                transList.push(transNumber.split('@')[0]);
                                instaCount++;
                            }
                        }
                        else {
                            instaCount++;
                        }
                    }
                    else if (method === 'instaPay' && type === 'contracting') {
                        instaContracting += amount;
                        instaTotal += amount;
                        if (transNumber !== undefined && transNumber.split('@').length === 2) {
                            if (!transList.includes(transNumber.split('@')[0])) {
                                transList.push(transNumber.split('@')[0]);
                                instaCount++;
                            }
                        }
                        else {
                            instaCount++;
                        }
                    }
                    else if (method === 'instaPay' && type === 'cashing') {
                        instaCashing += amount;
                        instaTotal += amount;
                        if (transNumber !== undefined && transNumber.split('@').length === 2) {
                            if (!transList.includes(transNumber.split('@')[0])) {
                                transList.push(transNumber.split('@')[0]);
                                instaCount++;
                            }
                        }
                        else {
                            instaCount++;
                        }
                    }
                });

                const grandTotal = cardTotal + depositTotal + transferTotal + instaTotal;
                const grandCount = cardCount + depositCount + transferCount + instaCount;

                const report = {};
                report.creditCard = {};
                report.creditCard.count = cardCount;
                report.creditCard.booking = {};
                report.creditCard.booking.amount = cardBooking;
                report.creditCard.booking.percent = Math.round((cardBooking / cardTotal) * 100);
                report.creditCard.contracting = {};
                report.creditCard.contracting.amount = cardContracting;
                report.creditCard.contracting.percent = Math.round((cardContracting / cardTotal) * 100);
                report.creditCard.cashing = {};
                report.creditCard.cashing.amount = cardCashing;
                report.creditCard.cashing.percent = Math.round((cardCashing / cardTotal) * 100);
                report.bankDeposit = {};
                report.bankDeposit.count = depositCount;
                report.bankDeposit.booking = {};
                report.bankDeposit.booking.amount = depositBooking;
                report.bankDeposit.booking.percent = Math.round((depositBooking / depositTotal) * 100);
                report.bankDeposit.contracting = {};
                report.bankDeposit.contracting.amount = depositContracting;
                report.bankDeposit.contracting.percent = Math.round((depositContracting / depositTotal) * 100);
                report.bankDeposit.cashing = {};
                report.bankDeposit.cashing.amount = depositCashing;
                report.bankDeposit.cashing.percent = Math.round((depositCashing / depositTotal) * 100);
                report.bankTransfer = {};
                report.bankTransfer.count = transferCount;
                report.bankTransfer.booking = {};
                report.bankTransfer.booking.amount = transferBooking;
                report.bankTransfer.booking.percent = Math.round((transferBooking / transferTotal) * 100);
                report.bankTransfer.contracting = {};
                report.bankTransfer.contracting.amount = transferContracting;
                report.bankTransfer.contracting.percent = Math.round((transferContracting / transferTotal) * 100);
                report.bankTransfer.cashing = {};
                report.bankTransfer.cashing.amount = transferCashing;
                report.bankTransfer.cashing.percent = Math.round((transferCashing / transferTotal) * 100);
                report.instaPay = {};
                report.instaPay.count = instaCount;
                report.instaPay.booking = {};
                report.instaPay.booking.amount = instaBooking;
                report.instaPay.booking.percent = Math.round((instaBooking / instaTotal) * 100);
                report.instaPay.contracting = {};
                report.instaPay.contracting.amount = instaContracting;
                report.instaPay.contracting.percent = Math.round((instaContracting / instaTotal) * 100);
                report.instaPay.cashing = {};
                report.instaPay.cashing.amount = instaCashing;
                report.instaPay.cashing.percent = Math.round((instaCashing / instaTotal) * 100);
                report.total = {};
                report.total.count = grandCount;
                report.total.creditCard = {};
                report.total.creditCard.amount = cardTotal;
                report.total.creditCard.percent = Math.round((cardTotal / grandTotal) * 100);
                report.total.bankDeposit = {};
                report.total.bankDeposit.amount = depositTotal;
                report.total.bankDeposit.percent = Math.round((depositTotal / grandTotal) * 100);
                report.total.bankTransfer = {};
                report.total.bankTransfer.amount = transferTotal;
                report.total.bankTransfer.percent = Math.round((transferTotal / grandTotal) * 100);
                report.total.instaPay = {};
                report.total.instaPay.amount = instaTotal;
                report.total.instaPay.percent = Math.round((instaTotal / grandTotal) * 100);

                res.status(200).json({
                    status: "success",
                    error: "",
                    message: {
                        report
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

const createPaymentChart = async (req, res) => {
    try {
        let {fromDate, toDate} = await req.body;

        if (new Date(fromDate) == 'Invalid Date' || new Date(toDate) == 'Invalid Date') {
            return res.status(400).json({
                status: "failed",
                error: req.i18n.t('payment.invalidDate'),
                message: {}
            });
        }

        fromDate = new Date(fromDate);
        toDate = new Date(new Date(toDate).getTime() + (24 * 60 * 60 * 1000));

        Payment.createPaymentsReport(fromDate, toDate)
            .then((payments) => {
                let day = fromDate;
                let totalPayments = 0;
                const chartList = [];
                while (day < toDate) {
                    let nextDay = new Date(day.getTime() + (24 * 60 * 60 * 1000));
                    const paymentsSubset = payments.filter((payment) => payment.paymentDetails.adviceDate >= day &&
                        payment.paymentDetails.adviceDate < nextDay);
                    const dayPayments = paymentsSubset.reduce((sum, payment) => sum + Number(payment.paymentDetails.amount), 0);
                    totalPayments += dayPayments;
                    chartList.push({day: day.toLocaleString(), dayPayments, totalPayments});
                    day = nextDay;
                }

                res.status(200).json({
                    status: "success",
                    error: "",
                    message: {
                        chartData: chartList
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

const createChecksReport = async (req, res) => {
    try {
        let {fromDate, toDate} = await req.body;

        if (new Date(fromDate) == 'Invalid Date' || new Date(toDate) == 'Invalid Date') {
            return res.status(400).json({
                status: "failed",
                error: req.i18n.t('payment.invalidDate'),
                message: {}
            });
        }

        fromDate = new Date(fromDate);
        toDate = new Date(new Date(toDate).getTime() + (24 * 60 * 60 * 1000));

        Check.createChecksReport(fromDate, toDate)
            .then((checks) => {
                let clearedAmount = 0, clearedCount = 0;
                let outstandingAmount = 0, outstandingCount = 0;
                let rejectedAmount = 0, rejectedCount = 0;
                let cashedAmount = 0, cashedCount = 0;
                let grandTotal = 0

                const report = {};
                report.cleared = {};
                report.cleared.checks = [];
                report.outstanding = {};
                report.outstanding.checks = [];
                report.rejected = {};
                report.rejected.checks = [];
                report.cashed = {};
                report.cashed.checks = [];

                checks.map((check) => {
                    const status = check.status.current;
                    const userName = check.userName;
                    const mobileNumber = check.mobile.number;
                    const bankName = i18n.t(`payment.banks.${check.bankName}`, {lng: 'ar'});
                    const checkNumber = check.number;
                    const amount = Number(check.amount);
                    const dueDate = check.dueDate;
                    const checkData = {userName, mobileNumber, bankName, checkNumber, amount, dueDate};

                    switch (status) {
                        case 'cleared':
                            clearedAmount += amount;
                            grandTotal += amount;
                            clearedCount++;
                            report.cleared.checks.push(checkData);
                            break;

                        case 'outstanding':
                            outstandingAmount += amount;
                            grandTotal += amount;
                            outstandingCount++;
                            report.outstanding.checks.push(checkData);
                            break;

                        case 'rejected':
                            rejectedAmount += amount;
                            grandTotal += amount;
                            rejectedCount++;
                            report.rejected.checks.push(checkData);
                            break;

                        case 'cashed':
                            cashedAmount += amount;
                            grandTotal += amount;
                            cashedCount++;
                            report.cashed.checks.push(checkData);
                            break;
                    }
                });

                report.cleared.amount = clearedAmount;
                report.cleared.count = clearedCount;
                report.cleared.percent = Math.round((clearedAmount / grandTotal) * 100);
                report.outstanding.amount = outstandingAmount;
                report.outstanding.count = outstandingCount;
                report.outstanding.percent = Math.round((outstandingAmount / grandTotal) * 100);
                report.rejected.amount = rejectedAmount;
                report.rejected.count = rejectedCount;
                report.rejected.percent = Math.round((rejectedAmount / grandTotal) * 100);
                report.cashed.amount = cashedAmount;
                report.cashed.count = cashedCount;
                report.cashed.percent = Math.round((cashedAmount / grandTotal) * 100);

                res.status(200).json({
                    status: "success",
                    error: "",
                    message: {
                        report
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

const createSalesReport = async (req, res) => {
    try {
        let {fromDate, toDate} = await req.body;

        if (new Date(fromDate) == 'Invalid Date' || new Date(toDate) == 'Invalid Date') {
            return res.status(400).json({
                status: "failed",
                error: req.i18n.t('payment.invalidDate'),
                message: {}
            });
        }

        fromDate = new Date(fromDate);
        toDate = new Date(new Date(toDate).getTime() + (24 * 60 * 60 * 1000));

        let bookingCount = 0, contractingCount = 0, contractsCount = 0;
        let middlesCount = 0, cornersCount = 0, streetCornersCount = 0;

        User.createSalesReport()
            .then((users) => {
                users.map((user) => {
                    user.units.map((unit) => {
                        if (unit.bookingDate >= fromDate && unit.bookingDate < toDate) {
                            bookingCount++;
                        }
                        if (unit.contractingDate !== undefined && unit.contractingDate >= fromDate && unit.contractingDate < toDate) {
                            contractingCount++;
                        }
                        if (unit.contractDate !== undefined && unit.contractDate >= fromDate && unit.contractDate < toDate) {
                            contractsCount++;
                            if (unit.category === 'category1') {
                                middlesCount++;
                            }
                            else if (unit.category === 'category2') {
                                cornersCount++;
                            }
                            else {
                                streetCornersCount++;
                            }
                        }
                    })
                });

                const report = {};
                report.bookingCount = bookingCount;
                report.contractingCount = contractingCount;
                report.contractsCount = contractsCount;
                report.middlesCount = middlesCount;
                report.cornersCount = cornersCount;
                report.streetCornersCount = streetCornersCount;

                res.status(200).json({
                    status: "success",
                    error: "",
                    message: {
                        report
                    }
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

const createDetailsReport = async (req, res) => {
    try {
        User.createDetailsReport()
            .then((users) => {
                let totalAmount = 0;
                users.map((user) => {
                    user._doc.userName = `${user.firstName} ${user.lastName}`;
                    user.firstName = undefined;
                    user.lastName = undefined;
                    user._doc.mobileNumber = user.mobile.primary.number;
                    user.mobile = undefined;
                    const paidAmount = user.payments.reduce((sum, item) => sum + Number(item.amount), 0);
                    user._doc.paidAmount = paidAmount;
                    totalAmount += paidAmount;
                    user.payments = undefined;
                    user._doc.unitsCount = user.units.length;
                    const units = [];
                    user.units.forEach((unit) => {
                        if (unit.category !== undefined) {
                            units.push(i18n.t(`product.${unit.category}.name`, {lng: 'ar'}));
                        }
                        else {
                            units.push('لم تتحدد بعد');
                        }

                    });
                    user._doc.unitsList = units;
                    user.units = undefined;
                });

                res.status(200).json({
                    status: "success",
                    error: "",
                    message: {
                        usersCount: users.length,
                        totalAmount,
                        users
                    }
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

const getProfileInfo = async (req, res) => {
    try {
        const {user: {id: staffID}} = await req.body;

        Staff.findOne({_id: staffID}, {_id: 0, firstName: 1, lastName: 1, mobile: 1, profilePhoto: 1, email: 1})
            .then((user) => {
                res.status(200).json({
                    status: "success",
                    error: "",
                    Message: {
                        user
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

module.exports = {
    addStaff,
    login,
    forgotPassword,
    verifyOTP,
    changePassword,
    updatePhoto,
    deletePhoto,
    getUserDetails,
    addPayment,
    linkPayment,
    findPayment,
    findTransaction,
    addBankCheck,
    findBankCheck,
    updateCheckStatus,
    getUnitTypes,
    selectUnitType,
    addContract,
    createPaymentsReport,
    createPaymentChart,
    createChecksReport,
    createSalesReport,
    createDetailsReport,
    getProfileInfo
}