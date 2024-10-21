const Check = require('../models/bankChecks');

const addBankCheck = (checkData) => {
    return new Promise(async (myResolve, myReject) => {
        await Check.create(checkData)
            .then((check) => {
                if (!check) {
                    myReject('creationFailed');
                }
                else {
                    myResolve('');
                }
        })
            .catch((err) => {
                if (err.toString().includes('bankName_1_number_1')) {
                    myResolve('repeatedCheck');
                }
                else {
                    myReject(err);
                }
            })
    })
}

const findBankCheck = ({bankName, number}) => {
    return new Promise((myResolve, myReject) => {
        Check.findOne({bankName, number}, {_id: 0})
            .then((check) => {
                if (!check) {
                    myReject('checkNotFound');
                }
                else {
                    myResolve(check);
                }
            })
            .catch((err) => {
                myReject(err);
            });
    })
}

const createChecksReport = (fromDate, toDate) => {
    return new Promise((myResolve, myReject) => {
        const query = {'status.adviceDate': {$gte: fromDate, $lt: toDate}};
        const projection = {userID: 0, unitId: 0, image: 0};
        Check.find(query, projection)
            .then((checks) => {
                myResolve(checks);
            })
            .catch((err) => {
                myReject(err);
            });
    })
}

const updateCheckStatus = ({staffID, bankName, number, newStatus, adviceDate}) => {
    return new Promise((myResolve, myReject) => {
        const statusRecord = {status: newStatus, staffID, adviceDate: new Date(adviceDate), date: new Date()};
        const projection = {userID: 1, unitId: 1};
        const update = {'status.current': newStatus, $push: {'status.history': statusRecord}};
        Check.findOneAndUpdate({bankName, number}, update, {projection, new: true})
            .then((check) => {
                if (!check) {
                    myReject('checkNotFound')
                }
                else {
                    myResolve({userID: check.userID, unitId: check.unitId});
                }
            })
            .catch((err) => {
                myReject(err);
            })
    })
}

module.exports = {addBankCheck, findBankCheck, updateCheckStatus, createChecksReport};