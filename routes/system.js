const express = require('express');
const router = express.Router();
const System = require('../controllers/system');

router.get('/payment-callback', System.paymentCallback);

module.exports = router;