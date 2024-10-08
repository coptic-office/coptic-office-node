const mongoose = require('mongoose');
const {Schema, model} = mongoose;

const bankCheckSchema = new Schema({
    _id: false,
    userID: String,
    userName: String,
    mobile: {country: String, number: String},
    unitId: String,
    number: String,
    dueDate: Date,
    amount: Number,
    bankName: String,
    status: {
        current: String,
        history: [
            {
                _id: false,
                status: String,
                staffID: String,
                adviceDate: Date,
                date: Date
            }
        ]
    },
    image: String,
})

const bankCheckModel = model('bank_check', bankCheckSchema);

module.exports = bankCheckModel;