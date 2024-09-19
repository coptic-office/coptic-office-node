const express = require('express');
const router = express.Router();
const user = require('../controllers/users');
const preUser = require('../controllers/preUsers');
const validateMobile = require("../middleware/mobileValidation");
const {listCountries} = require('../controllers/countries')
const {authorize} = require('../middleware/auth');
const multipartParser = require('../middleware/multipartParser');
const Process = require("process");

const accessToken = 'Access';
const renewToken = 'Renew';

/** Get list of supported countries */
router.get('/list-countries', listCountries);

/** Check user existence by mobile or email as per the system settings */
router.post('/check-user/', validateMobile, preUser.checkUser);

/** Verify the OTP */
const verifyOTPRoles = ['User', 'Guest'];
router.post('/verify-otp/', authorize(accessToken, verifyOTPRoles), preUser.verifyOTP);

/** Resend the OTP */
const resendOTPRoles = ['User', 'Guest'];
router.post('/resend-otp/', authorize(accessToken, resendOTPRoles), preUser.resendOTP);

/** Create new users */
router.post('/create-user', user.createUser);

/** User ogin */
router.post('/login', user.login);

/** Renew the expired Access Token using the Renew Token */
const renewAccessTokenRoles = ['Admin', 'User'];
router.post('/renew-access-token/', authorize(renewToken, renewAccessTokenRoles), user.renewAccessToken);

/** Generate API Token for the use of system endpoints */
const generateApiTokenRoles = ['User'];
router.post('/generate-api-token/', authorize(accessToken, generateApiTokenRoles), user.generateApiToken);

/** Forgot Password using either mobile number or email */
router.post('/forgot-password/', validateMobile, preUser.forgotPassword);

/** Change password using old password or verification code for those who forgot their passwords */
const changePasswordRoles = ['Admin', 'User', 'Guest'];
router.post('/change-password/', authorize(accessToken, changePasswordRoles), user.changePassword);

/** Update user's mobile number */
const updateMobileRoles = ['User'];
router.post('/update-mobile', [authorize(accessToken, updateMobileRoles), validateMobile], user.updateMobile);

/** Update user's email */
const updateEmailRoles = ['User'];
router.post('/update-email', authorize(accessToken, updateEmailRoles), user.updateEmail);

/** Get users listing */
router.get('/', user.getUsers);

/** Get a user by mobile number */
const getUserByMobileRoles = ['User'];
router.post('/validate-mobile', [authorize(accessToken, getUserByMobileRoles), validateMobile], user.getUserByMobile);

/** Get the appropriate payment options for a specific user for all his bookings */
const getPaymentOptionsRoles = ['User'];
router.post('/get-payment-options', authorize(accessToken, getPaymentOptionsRoles), user.getPaymentOptions);

/** Get all the payments for a specific user along with bank checks */
const getMyPaymentsRoles = ['User'];
router.post('/get-my-payments', authorize(accessToken, getMyPaymentsRoles), user.getMyPayments);

/** Get all the units booked for a specific user */
const getMyUnitsRoles = ['User'];
router.post('/get-my-units', authorize(accessToken, getMyUnitsRoles), user.getMyUnits);

/** Allows the user to select a specific unit type */
const selectUnitTypeRoles = ['User'];
router.post('/select-unit-type', authorize(accessToken, selectUnitTypeRoles), user.selectUnitType);

/** Get the units types, with the currently selected category for a specific user */
const getUnitTypesRoles = ['User'];
router.post('/get-unit-types', authorize(accessToken, getUnitTypesRoles), user.getUnitTypes);

/** Get a list of all the new and old notifications for a specific user */
const getNotificationRoles = ['User'];
router.post('/get-notifications', authorize(accessToken, getNotificationRoles), user.getNotifications);

/** Return the user's profile information */
const getProfileRoles = ['User'];
router.post('/get-profile-info', authorize(accessToken, getProfileRoles), user.getProfileInfo);

const fileTypesList = Process.env.IMAGE_FILE_TYPE.split(',');
/** Update the user's profile photo */
const updatePhotoRoles = ['User'];
const options1 = {maxFileSize: 1, maxFilesCount: 1, fileTypesList};
router.post('/update-photo', [authorize(accessToken, updatePhotoRoles), multipartParser(options1, 'image')], user.updatePhoto);

/** Delete the user's profile photo */
const deletePhotoRoles = ['User'];
router.post('/delete-photo', authorize(accessToken, deletePhotoRoles), user.deletePhoto);

/** Update the user's national ID */
const updateNationalIdRoles = ['User'];
const options2 = {maxFileSize: 1, maxFilesCount: 2, fileTypesList};
router.post('/update-national-id', [authorize(accessToken, updateNationalIdRoles), multipartParser(options2, 'images')], user.updateNationalId);

module.exports = router;
