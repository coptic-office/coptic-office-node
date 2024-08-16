const express = require('express');
const router = express.Router();
const user = require('../controllers/users');
const preUser = require('../controllers/preUsers');
const validateMobile = require("../middleware/mobileValidation");
const {listCountries} = require('../controllers/countries')
const {authorize} = require('../middleware/auth');

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

/** Login */
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

/** Update user's subscription */
const updateSubscriptionRoles = ['User'];
router.post('/update-subscription', authorize(accessToken, updateSubscriptionRoles), user.updateSubscription);

module.exports = router;
