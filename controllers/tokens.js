const Token = require('../models/tokens');

const createToken = async (userID, token, type) => {
    return new Promise((myResolve, myReject) => {
        Token.findOneAndUpdate({userID, type}, {token}, {upsert: true, new: true})
            .then(() => {
                myResolve();
            })
            .catch((err) => {
                myReject(err);
            })
    })
}

const validateToken = async (token) => {
    return new Promise((myResolve, myReject) => {
        Token.findOne({token})
            .then((result) => {
                myResolve(result);
            })
            .catch((err) => {
                myReject();
            })
    })
}

module.exports = {createToken, validateToken};