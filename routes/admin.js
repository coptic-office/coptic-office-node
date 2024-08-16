const express = require('express');
const router = express.Router();
const user = require('../controllers/users');
const validateMobile = require("../middleware/mobileValidation");
const {updatePriceCatalog, getPriceCatalog} = require("../controllers/priceCatalogs");

/** Invalidate token by its type */
router.post('/invalidate-token', validateMobile, user.invalidateToken);

/** Update the user's suspension status */
router.post('/update-suspension', validateMobile, user.updateSuspension);

/** Update the price catalog for a certain SMS aggregator */
router.post('/update-price-catalog', updatePriceCatalog);

/** Get the price catalog for a certain SMS aggregator */
router.post('/get-price-catalog', getPriceCatalog);

module.exports = router;