const mongoose = require('mongoose');
const {Schema, model} = mongoose;

const paymentSchema = new Schema({
    userID: String,
    unitId: String,
    paymentType: {
        type: String,
        enum: {
            values: ['booking', 'contracting', 'cat1cash', 'cat2cash', 'cat3cash']
        }
    },
    receiptDetails: {
        transactionNumber: String,
        items: [{
            _id: false,
            name: String,
            price: mongoose.Decimal128
        }],
        amount: mongoose.Decimal128
    },
    paymentDetails: {
        paymentGateway: String,
        amount: mongoose.Decimal128,
        date: Date,
        status: {
            type: String,
            enum: {
                values: ['Pending', 'Succeeded', 'Failed']
            }
        },
        adviceDate: Date,
        bankSessionId: String,
        bankSuccessIndicator: String
    }
})

const paymentModel = model('payment', paymentSchema);

module.exports = paymentModel;