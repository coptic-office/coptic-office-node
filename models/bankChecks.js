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
                status: String,
                staffID: String,
                date: Date
            }
        ]
    },
    image: String,
})

const bankCheckModel = model('bankCheck', bankCheckSchema);

module.exports = bankCheckModel;