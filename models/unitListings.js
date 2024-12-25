const mongoose = require('mongoose');
const {Schema, model} = mongoose;

const unitListingSchema = new Schema({
    _id: false,
    phase: String,
    row: Number,
    blockNumber: Number,
    unitNumber: Number,
    category: {
        type: String,
        enum: {
            values: ['category1', 'category2', 'category3']
        }
    },
    status: {
        type: String,
        enum: {
            values: ['closed', 'open', 'booked', 'sold']
        }
    },
    userID: String,
    userName: String,
    mobile: {country: String, number: String},
    unitId: String,
    contractDate: Date
});

unitListingSchema.index({blockNumber: 1, unitNumber: 1}, {unique: true});

const unitListingModel = model('unit_listing', unitListingSchema);

module.exports = unitListingModel;