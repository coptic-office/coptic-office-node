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
const changePasswordRoles = ['ADMIN', 'EMPLOYEE', 'SUPERVISOR', 'MANAGER', 'Guest'];
router.post('/change-password/', authorize('Access', changePasswordRoles), staff.changePassword);

const fileTypesList = Process.env.IMAGE_FILE_TYPE.split(',');
/** Update the staff profile photo */
const updatePhotoRoles = ['ADMIN', 'EMPLOYEE', 'SUPERVISOR', 'MANAGER'];
const options1 = {maxFileSize: 1, maxFilesCount: 1, fileTypesList};
router.post('/update-photo', [authorize('Access', updatePhotoRoles), multipartParser(options1, 'image')], staff.updatePhoto);

/** Delete the staff profile photo */
const deletePhotoRoles = ['ADMIN', 'EMPLOYEE', 'SUPERVISOR', 'MANAGER'];
router.post('/delete-photo', authorize('Access', deletePhotoRoles), staff.deletePhoto);

/** Retrieve full user details of a specific user using his registered mobile number */
const userDetailsRoles = ['ADMIN', 'EMPLOYEE', 'SUPERVISOR', 'MANAGER'];
router.post('/get-user-details', [authorize('Access', userDetailsRoles), validateMobile], staff.getUserDetails);

/** Add a payment for a booked unit of a specific user */
const addPaymentRoles = ['ADMIN', 'EMPLOYEE', 'SUPERVISOR', 'MANAGER'];
router.post('/add-payment', authorize('Access', addPaymentRoles), staff.addPayment);

/** Link an existing payment with a specific user */
const linkPaymentRoles = ['ADMIN', 'EMPLOYEE', 'SUPERVISOR', 'MANAGER'];
router.post('/link-payment', authorize('Access', linkPaymentRoles), staff.linkPayment);

/** Add a bank check for a booked unit of a specific user */
const addCheckRoles = ['ADMIN', 'EMPLOYEE', 'SUPERVISOR', 'MANAGER'];
const options2 = {maxFileSize: 1, maxFilesCount: 1, fileTypesList};
router.post('/add-bank-check', [authorize('Access', addCheckRoles), multipartParser(options2, 'image')], staff.addBankCheck);

/** Find a bank check using bank name and check number */
const findCheckRoles = ['ADMIN', 'EMPLOYEE', 'SUPERVISOR', 'MANAGER'];
router.post('/find-bank-check', authorize('Access', findCheckRoles), staff.findBankCheck);

/** Update a bank check status using bank name, check number and the new status */
const updateCheckRoles = ['ADMIN', 'EMPLOYEE', 'SUPERVISOR', 'MANAGER'];
router.post('/update-check-status', authorize('Access', updateCheckRoles), staff.updateCheckStatus);

/** Add the contract of a unit for a specific user */
const addContractRoles = ['ADMIN', 'EMPLOYEE', 'SUPERVISOR', 'MANAGER'];
const options3 = {maxFileSize: 2, maxFilesCount: 1, fileTypesList: ['pdf']};
router.post('/add-contract', [authorize('Access', addContractRoles), multipartParser(options3, 'pdfFile')], staff.addContract);

module.exports = router;