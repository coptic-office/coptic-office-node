const mongoose = require('mongoose');
const {Schema, model} = mongoose;

const smsRecordsSchema = new Schema({
    userID: String,
    message: String,
    mobile: {
        country: String,
        number: String
    },
    aggregator: String,
    status: {
        type: String,
        enum: {
            values: ['Succeeded', 'Failed']
        }
    },
    errorReason: String,
    costPrice: mongoose.Decimal128,
    sellingPrice: mongoose.Decimal128,
    paidPrice: {
        balance: {
            type: mongoose.Decimal128,
            default: 0
        },
        courtesy: {
            type: mongoose.Decimal128,
            default: 0
        },
        credit: {
            type: mongoose.Decimal128,
            default: 0
        },
        system: {
            type: mongoose.Decimal128,
            default: 0
        }
    },
    plan: {
        type: String,
        enum: {
            values: ['PAYG', 'Pigeon50', 'Pigeon100', 'Pigeon200', 'System']
        }
    },
    comment: String,
    date: Date
})

const smsRecordsModel = model('sms_record', smsRecordsSchema);

module.exports = smsRecordsModel;