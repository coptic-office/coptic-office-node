const Check = require('../models/bankChecks');

const addBankCheck = (checkData) => {
    return new Promise(async (myResolve, myReject) => {
        await Check.create(checkData)
            .then((check) => {
                if (!check) {
                    myReject('creationFailed');
                }
                else {
                    myResolve();
                }
        })
            .catch((err) => {
                myReject(err);
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

module.exports = {addBankCheck, findBankCheck};