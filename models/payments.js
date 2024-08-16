const mongoose = require('mongoose');
const {Schema, model} = mongoose;

const paymentSchema = new Schema({
    userID: String,
    paymentType: {
        type: String,
        enum: {
            values: ['Booking', 'Contracting', 'cat1Cash', 'cat2Cash', 'cat3Cash']
        }
    },
    receiptDetails: {
        transactionNumber: String,
        items: [{
            name: String,
            price: mongoose.Decimal128
        }],
        price: {
            totalAmount: mongoose.Decimal128,
            netAmount: mongoose.Decimal128,
            coupon: String
        }
    },
    paymentDetails: {
        paymentGateway: String,
        amount: mongoose.Decimal128,
        referenceNumber: String,
        date: Date,
        status: {
            type: String,
            enum: {
                values: ['Pending', 'Succeeded', 'Failed']
            }
        },
        adviceDate: Date
    }
})

const paymentModel = model('payment', paymentSchema);

module.exports = paymentModel;