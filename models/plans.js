const mongoose = require('mongoose');
const {Schema, model} = mongoose;

const planSchema = new Schema({
    name: {
        type: String,
        enum: {
            values: ['PAYG', 'Recognize50', 'Recognize100', 'Recognize200']
        }
    },
    monthlyFee: mongoose.Decimal128,
    products: [{
        code: String,
        name: String,
        price: mongoose.Decimal128,
        _id: 0
    }],
    isActive: {
        type: Boolean,
        default: true
    }
})

const planModel = model('plan', planSchema);

module.exports = planModel;