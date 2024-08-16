const express = require('express');
const router = express.Router();
const Plan = require('../controllers/plans');

/** Get list of all the active plans with full details */
router.post('/get-plans', Plan.getPlans);

/** Get full details of a specific plan if found and active */
router.post('/get-plan', Plan.getPlan);

module.exports = router;