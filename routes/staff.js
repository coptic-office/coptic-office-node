const express = require('express');
const router = express.Router();
const staff = require('../controllers/staff');
const validateMobile = require("../middleware/mobileValidation");
const {authorize} = require("../middleware/auth");
const Process = require("process");
const multipartParser = require("../middleware/multipartParser");

/** Staff login */
router.post('/login', staff.login);

/** Forgot Password */
router.post('/forgot-password/', validateMobile, staff.forgotPassword);

/** Verify the OTP */
router.post('/verify-otp/', staff.verifyOTP);

/** Change password using old password or verification code for those who forgot their passwords */
const changePasswordRoles = ['Admin', 'EMPLOYEE', 'SUPERVISOR', 'MANAGER', 'Guest'];
router.post('/change-password/', authorize('Access', changePasswordRoles), staff.changePassword);

const fileTypesList = Process.env.IMAGE_FILE_TYPE.split(',');
/** Update the staff profile photo */
const updatePhotoRoles = ['Admin', 'EMPLOYEE', 'SUPERVISOR', 'MANAGER'];
const options1 = {maxFileSize: 1, maxFilesCount: 1, fileTypesList};
router.post('/update-photo', [authorize('Access', updatePhotoRoles), multipartParser(options1, 'image')], staff.updatePhoto);

module.exports = router;