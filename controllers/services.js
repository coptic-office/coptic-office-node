const Service = require('../models/services');

const getServiceData = (serviceName) => {
    return new Promise((myResolve, myReject) => {
        Service.findOne({name: serviceName, isActive: true}, {settings:1, monthlyFee: 1})
            .then((service) => {
                if (!service) {
                    myReject('unavailableService');
                }
                myResolve({settings: service.settings, price: Number(service.monthlyFee)});
            })
            .catch((err) => {
                myReject(err);
            })
    })
}

module.exports = {getServiceData};