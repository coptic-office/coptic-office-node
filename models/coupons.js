const mongoose = require('mongoose');
const {Schema, model} = mongoose;

const couponSchema = new Schema({
    code: String,
    beneficiary: String,
    creationDate: Date,
    expiryDate: Date,
    discountAmount: mongoose.Decimal128,
    discountPercent: {
        percentage: mongoose.Decimal128,
        maxAmount: mongoose.Decimal128
    }
})

const couponModel = model('coupon', couponSchema);

module.exports = couponModel;