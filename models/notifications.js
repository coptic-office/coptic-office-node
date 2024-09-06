const mongoose = require('mongoose');
const {Schema, model} = mongoose;

const notificationSchema = new Schema({
    name: String,
    messages: {
        ar: String,
        en: String
    }
})

const notificationModel = model('notification', notificationSchema);

module.exports = notificationModel;