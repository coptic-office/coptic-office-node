const mongoose = require('mongoose');
const {Schema, model} = mongoose;

const unitListingSchema = new Schema({
    _id: false,
    unitNumber: String,
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
});

unitListingSchema.index({unitNumber: 1}, {unique: true});

const unitListingModel = model('unit_listing', unitListingSchema);

module.exports = unitListingModel;