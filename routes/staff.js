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

/** Delete the staff profile photo */
const deletePhotoRoles = ['Admin', 'EMPLOYEE', 'SUPERVISOR', 'MANAGER'];
router.post('/delete-photo', authorize('Access', deletePhotoRoles), staff.deletePhoto);

/** Show full user details of a specific user using his registered mobile number */
const userDetailsRoles = ['Admin', 'EMPLOYEE', 'SUPERVISOR', 'MANAGER'];
router.post('/get-user-details', [authorize('Access', userDetailsRoles), validateMobile], staff.getUserDetails);

/** Add a payment for a booked unit of a specific user */
const addPaymentRoles = ['EMPLOYEE', 'SUPERVISOR', 'MANAGER'];
router.post('/add-payment', authorize('Access', addPaymentRoles), staff.addPayment);

/** Add a bank check for a booked unit of a specific user */
const addCheckRoles = ['EMPLOYEE', 'SUPERVISOR', 'MANAGER'];
router.post('/add-bank-check', authorize('Access', addCheckRoles), staff.addBankCheck);


module.exports = router;