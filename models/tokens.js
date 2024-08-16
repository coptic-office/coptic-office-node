const mongoose = require('mongoose');
const {Schema, model} = mongoose;

const tokenSchema = new Schema({
    userID: String,
    token: String,
    type: {
        type: String,
        enum: {
            values: ['Renew', 'Api']
        }
    }
})

const tokenModel = model('token', tokenSchema);

module.exports = tokenModel;