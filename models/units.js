const mongoose = require('mongoose');
const {Schema, model} = mongoose;

const unitSchema = new Schema({
    category: {
        type: String,
        enum: {
            values: ['unitCat1', 'unitCat2', 'unitCat3']
        }
    },
    bookingAmount: Number,
    contractingAmount: Number,
    grossAmount: Number,
    cashAmount: Number,
    installments: {
        count: Number,
        amount: Number,
        spanInMonths: Number
    },
    images: [],
    isActive: Boolean
})

const unitModel = model('unit', unitSchema);

module.exports = unitModel;