const express = require('express');
const router = express.Router();
const staff = require('../controllers/staff');
const validateMobile = require("../middleware/mobileValidation");
const {authorize} = require("../middleware/auth");

/** Staff login */
router.post('/login', staff.login);

/** Forgot Password */
router.post('/forgot-password/', validateMobile, staff.forgotPassword);

/** Verify the OTP */
router.post('/verify-otp/', staff.verifyOTP);

/** Change password using old password or verification code for those who forgot their passwords */
const changePasswordRoles = ['Admin', 'EMPLOYEE', 'SUPERVISOR', 'MANAGER', 'Guest'];
router.post('/change-password/', authorize('Access', changePasswordRoles), staff.changePassword);

module.exports = router;