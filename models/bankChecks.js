const mongoose = require('mongoose');
const {Schema, model} = mongoose;

const bankCheckSchema = new Schema({
    _id: false,
    userID: String,
    unitId: String,
    number: String,
    dueDate: Date,
    amount: Number,
    bankName: String,
    status: String,
    image: String,
    staffID: String,
    date: Date
})

const bankCheckModel = model('bankCheck', bankCheckSchema);

module.exports = bankCheckModel;