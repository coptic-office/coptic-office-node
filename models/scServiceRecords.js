const mongoose = require('mongoose');
const {Schema, model} = mongoose;

const scServiceRecordsSchema = new Schema({
    userID: String,
    mobileNumber: String,
    wrongTrials: {
        type: Number,
        default: 0
    },
    otpDelay: Number,
    otpResend: Date,
    otpRenewal: Date
})

const scServiceRecordsModel = model('sc_service_record', scServiceRecordsSchema);

module.exports = scServiceRecordsModel;