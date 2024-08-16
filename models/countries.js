const mongoose = require('mongoose');
const {Schema, model} = mongoose;

const countrySchema = new Schema({
    name: String,
    code: String,
    key: String,
    pattern: String,
    currency: String,
    senderID: String,
    isActive: Boolean
})

const countryModel = model('country', countrySchema);

module.exports = countryModel;