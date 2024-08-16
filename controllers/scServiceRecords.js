const ScRecords = require('../models/scServiceRecords');

const createScRecord = async (scRecord) => {
    return new Promise((myResolve, myReject) => {
        ScRecords.create(scRecord)
            .then(() => {
                myResolve();
            })
            .catch((err) => {
                myReject(err);
            })
    })
}

const findScRecord = async (userID, mobileNumber) => {
    return new Promise ((myResolve, myReject) => {
        ScRecords.findOne({userID, mobileNumber}, {_id: 0, __v: 0, userID: 0, mobileNumber:0})
            .then((scRecord) => {
                myResolve(scRecord);
            })
            .catch((err) => {
                myReject(err);
            })
    })
}

const updateScRecord = async (filter, update) => {
    return new Promise ((myResolve, myReject) => {
        ScRecords.findOneAndUpdate(filter, update, {new: true})
            .then((scRecord) => {
                myResolve(scRecord);
            })
            .catch((err) => {
                myReject(err);
            })
    })
}

const deleteScRecord = async (userID, mobileNumber) => {
    return new Promise ((myResolve, myReject) => {
        ScRecords.deleteOne({userID, mobileNumber})
            .then(() => {
                myResolve();
            })
            .catch((err) => {
                myReject(err);
            })
    })
}

module.exports = {createScRecord, findScRecord, updateScRecord, deleteScRecord};