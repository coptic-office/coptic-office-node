const mongoose = require('mongoose');
const {Schema, model} = mongoose;

const smsAggregatorSchema = new Schema({
    name: String,
    url: String,
    isActive: {
        type: Boolean,
        default: true
    }
})

const smsAggregatorModel = model('sms_aggregator', smsAggregatorSchema);

module.exports = smsAggregatorModel;