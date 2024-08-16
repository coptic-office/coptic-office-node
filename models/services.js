const mongoose = require('mongoose');
const {Schema, model} = mongoose;

const serviceSchema = new Schema({
    name: String,
    settings: Object,
    monthlyFee: mongoose.Decimal128,
    isActive: Boolean
})

const serviceModel = model('service', serviceSchema);

module.exports = serviceModel;