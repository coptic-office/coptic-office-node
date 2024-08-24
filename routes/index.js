const express = require('express');
const router = express.Router();
const Unit = require('../models/units');

/** Get a list of units details for the home page **/
router.get('/', (req, res) => {
    try {
        Unit.find({isActive: true}, {_id: 0, isActive: 0})
            .then((units) => {
                units.map((unit) => unit.category = req.i18n.t(`product.${unit.category}.name`))
                res.status(200).json({
                    status: "success",
                    error: "",
                    message: {
                        units
                    }
                })
            })
            .catch((err) => {
                res.status(500)
                    .json({
                        status: "failed",
                        error: req.i18n.t('general.internalError'),
                        message: {
                            info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
                        }
                    })
            });
    }
    catch (err) {
        res.status(500)
            .json({
                status: "failed",
                error: req.i18n.t('general.internalError'),
                message: {
                    info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
                }
            })
    }
});

module.exports = router;
