const mongoose = require('mongoose');
const {Schema, model} = mongoose;

const bankCheckSchema = new Schema({
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
        adviceDate: Date,
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

bankCheckSchema.index({bankName: 1, number: 1}, {unique: true});

const bankCheckModel = model('bank_check', bankCheckSchema);

module.exports = bankCheckModel;