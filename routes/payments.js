const express = require('express');
const router = express.Router();
const payment = require('../controllers/payments');
const {authorize} = require("../middleware/auth");

const accessToken = 'Access';

/** Create new payment */
const createPaymentRoles = ['User'];
router.post('/create-payment', authorize(accessToken, createPaymentRoles), payment.createPayment);

module.exports = router;