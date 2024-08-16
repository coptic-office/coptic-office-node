const Coupon = require('../models/coupons');
const {getCoupons} = require('../controllers/users');

const validateCoupon = (coupon, userID, totalAmount) => {
    return new Promise((myResolve, myReject) => {
        const coupons = [coupon]
        getCoupons(coupons, userID)
            .then((resultCoupons) => {
                if (resultCoupons.length === 0) {
                    Coupon.findOne({$and: [
                            {code: coupon},
                            {$or: [{beneficiary: userID}, {beneficiary: 'All'}]},
                            {$or: [{expiryDate: {$exists: false}}, {expiryDate: {$gt: new Date()}}]}
                        ]}, {_id: 0, discountAmount: 1, discountPercent: 1})
                        .then((resultCoupon) => {
                            if (!resultCoupon) {
                                myReject('invalidCoupon');
                            }
                            else {
                                let {discountAmount, discountPercent} = resultCoupon;
                                if (JSON.stringify(discountPercent) !== '{}') {
                                    const {percentage, maxAmount} = discountPercent;
                                    discountAmount = Math.min((totalAmount * percentage / 100).toFixed(2), maxAmount);
                                }
                                myResolve(Number(discountAmount));
                            }
                        })
                        .catch((err) => {
                            myReject(err);
                        })
                }
                else {
                    myReject('usedCoupon');
                }
            })
            .catch((err) => {
                myReject(err);
            })
    })
}

module.exports = {validateCoupon};