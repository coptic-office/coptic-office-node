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

module.exports = {addBankCheck};