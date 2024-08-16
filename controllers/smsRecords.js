const SmsRecord = require('../models/smsRecords');

const createSmsRecord = async (smsRecord) => {
    return new Promise((myResolve, myReject) => {
        SmsRecord.create(smsRecord)
            .then(() => {
                myResolve();
            })
            .catch((err) => {
                myReject(err);
            })
    })
}

module.exports = {createSmsRecord};