const Aggregator = require('../models/smsAggregators');

const getAggregator = async (aggregator) => {
    return new Promise((myResolve, myReject) => {
        Aggregator.findOne({name: aggregator, isActive: true}, {_id: 0, __v: 0, isActive: 0})
            .then((targetAggregator) => {
                myResolve(targetAggregator);
            })
            .catch((err) => {
                myReject(err);
            })
    })
}

const getAggregators = async () => {
    return new Promise((myResolve, myReject) => {
        Aggregator.find({isActive: true}, {_id: 0, name: 1})
            .then((aggregators) => {
                myResolve(aggregators);
            })
            .catch((err) => {
                myReject(err);
            })
    })
}

module.exports = {getAggregator, getAggregators};