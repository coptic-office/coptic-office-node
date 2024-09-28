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
        bodyData.email['primary'] = email;

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
        const fileKey = `staff/${userID}/photos/profile.jpg`;
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
                Staff.findOneAndUpdate({_id: userID}, {profilePhoto})
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

const deletePhoto = async (req, res) => {
    try {
        const {user: {id: userID}} = await req.body;

        const defaultPhoto = process.env.GENERAL_DEFAULT_PROFILE;
        Staff.updateOne({_id: userID}, {profilePhoto: defaultPhoto})
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
                    check.status = undefined;
                    check.image = undefined;
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

                    unit.priceDetails = undefined;
                    unit.completionDate = undefined;
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
        const {user: {id: userID}, id, unitId, paymentType, paymentMethod, amount, adviceDate, referenceNumber, comments} = await req.body;

        const uniqueId = generateUUID();
        const itemDescription = req.i18n.t(`bankItem.${paymentType.toString().toLowerCase()}`);

        const paymentData = {};
        paymentData.userID = id;
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
        paymentData.paymentDetails.paymentMethod = paymentMethod.toString().toLowerCase();
        paymentData.paymentDetails.locale = 'ar';
        paymentData.paymentDetails.amount = amount;
        paymentData.paymentDetails.date = new Date();
        paymentData.paymentDetails.adviceDate = new Date(adviceDate);
        paymentData.paymentDetails.referenceNumber  =referenceNumber;
        paymentData.paymentDetails.status = 'Succeeded';
        paymentData.paymentDetails.comments = comments;
        paymentData.paymentDetails.staffID = userID;

        Payment.addPayment(paymentData)
            .then(({paymentId}) => {
                const paymentData = {
                    userID: id,
                    id: paymentId,
                    paymentType: paymentType.toString().toLowerCase(),
                    paymentMethod: paymentMethod.toString().toLowerCase(),
                    amount: amount,
                    adviceDate: new Date(adviceDate),
                    unitId: unitId
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

const addBankCheck = async (req, res) => {
    try {
        const region = process.env.S3_REGION;
        const accessKeyId = process.env.S3_ACCESS_KEY_ID;
        const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
        const bucket = process.env.S3_BUCKET;
        const client = new S3Client({region, credentials: {accessKeyId, secretAccessKey}});

        const {user: {id: userID}, id, unitId, number, dueDate, amount, bankName, status} = await req.body;
        const filesNumber = await req.files.length;
        if (filesNumber !== 1) {
            return res.status(400).json({
                status: "failed",
                error: req.i18n.t(`user.checkPhotoRequired`),
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
        const width = Number(process.env.IMAGE_CHECK_MAX_WIDTH);
        const {buffer} = await Image.compress(file.buffer, width);
        const fileStream = Readable.from(buffer);
        const fileKey = `users/${userID}/checks/${bankName}-${number}.jpg`;
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
                checkData.status.current = status;
                checkData.status.history.push({status, staffID: userID, date: new Date()});
                checkData.image  = checkUrl;

                User.addBankCheck(checkData)
                    .then(({userName, mobile}) => {
                        checkData.userName = userName;
                        checkData.mobile = mobile;

                        Check.addBankCheck(checkData)
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
                    .catch((err) => [
                        res.status(500).json(
                            {
                                status: "failed",
                                error: req.i18n.t('general.internalError'),
                                message: {
                                    info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
                                }
                            })
                    ]);
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

        Check.findBankCheck({bankName, number})
            .then((check) => {
                check.bankName = req.i18n.t(`payment.banks.${check.bankName}`);
                check._doc.statusText = req.i18n.t(`payment.checkStatus.${check.status.current}`);
                check.status = undefined;

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
    addBankCheck,
    findBankCheck
}