const mongoose = require('mongoose');
const {Schema, model} = mongoose;

const priceCatalogSchema = new Schema({
    country: String,
    aggregators: [{
        name: String,
        price: mongoose.Decimal128,
        isActive: Boolean,
        _id: false
    }],
})

const priceCatalogModel = model('price_catalog', priceCatalogSchema);

module.exports = priceCatalogModel;