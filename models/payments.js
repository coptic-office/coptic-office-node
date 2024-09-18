const mongoose = require('mongoose');
const {Schema, model} = mongoose;

const paymentSchema = new Schema({
    userID: String,
    unitId: String,
    paymentType: {
        type: String,
        enum: {
            values: ['booking', 'contracting', 'cashing']
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
        paymentMethod: {
            type: String,
            enum: {
                values: ['bankDeposit', 'bankTransfer', 'instaPay', 'creditCard']
            }
        },
        locale: {
            type: String,
            values: ['ar', 'en']
        },
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
        bankSuccessIndicator: String,
        referenceNumber: String,
        staffID: String,
        comments: String
    }
})

const paymentModel = model('payment', paymentSchema);

module.exports = paymentModel;