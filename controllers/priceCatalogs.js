const PriceCatalog = require('../models/priceCatalogs');
const fs = require('fs');
const {getAggregator, getAggregators} = require("./smsAggregators");

const updatePriceCatalog = async (req, res) => {
    try {
        const promises = [];
        const {aggregator, input} = await req.body;
        if (aggregator === undefined) {
            return res.status(400).json({
                status: "failed",
                error: req.i18n.t('admin.aggregatorRequired'),
                message: {}
            })
        }
        getAggregator(aggregator)
            .then((targetAggregator) => {
                if (!targetAggregator) {
                    return res.status(404).json({
                        status: "failed",
                        error: req.i18n.t('admin.aggregatorNotFound'),
                        message: {}
                    })
                }
                if (input === undefined) {
                    return res.status(400).json({
                        status: "failed",
                        error: req.i18n.t('admin.inputRequired'),
                        message: {}
                    })
                }
                const file = input === 'file';
                let filePath = '';
                let data = undefined;
                if (file) {
                    filePath = `./input/${aggregator}.json`;
                    data = fs.readFileSync(filePath, { encoding: 'utf8' })
                    data = JSON.parse(data);
                }
                else {
                    data = input;
                }
                for (const i in data) {
                    if (data[i].country.isModified || data[i].country.isModified === undefined) {
                        promises.push(new Promise((myResolve, myReject) => {
                            PriceCatalog.findOne({country: data[i].country.name})
                                .then((targetCountry) => {
                                    if (!targetCountry) {
                                        PriceCatalog.create({
                                            country: data[i].country.name,
                                            aggregators: {
                                                name: aggregator,
                                                price: data[i].country.price,
                                                isActive: data[i].country.isActive
                                            }
                                        })
                                            .then(() => {
                                                data[i].country.isModified = false;
                                                data[i].country.updateStatus = undefined;
                                                myResolve([1]);
                                            })
                                            .catch((err) => {
                                                data[i].country.updateStatus = false;
                                                myResolve([-1, data[i].country.name]);
                                            })
                                    }
                                    else {
                                        const targetAggregator = targetCountry.aggregators.find((element) => {
                                            return element.name === aggregator
                                        })
                                        if (targetAggregator === undefined) {
                                            const filter = {country: data[i].country.name};
                                            const update = {
                                                $push: {
                                                    aggregators: {
                                                        name: aggregator,
                                                        price: data[i].country.price,
                                                        isActive: data[i].country.isActive
                                                    }
                                                }
                                            }
                                            PriceCatalog.updateOne(filter, update)
                                                .then(() => {
                                                    data[i].country.isModified = false;
                                                    data[i].country.updateStatus = undefined;
                                                    myResolve([1]);
                                                })
                                                .catch((err) => {
                                                    data[i].country.updateStatus = false;
                                                    myResolve([-1, data[i].country.name]);
                                                })
                                        }
                                        else {
                                            const filter = {country: data[i].country.name, 'aggregators.name': aggregator};
                                            const update = {
                                                $set: {
                                                    'aggregators.$.price': data[i].country.price,
                                                    'aggregators.$.isActive': data[i].country.isActive
                                                }
                                            }
                                            PriceCatalog.updateOne(filter, update)
                                                .then(() => {
                                                    data[i].country.isModified = false;
                                                    data[i].country.updateStatus = undefined;
                                                    myResolve([1]);
                                                })
                                                .catch((err) => {
                                                    data[i].country.updateStatus = false;
                                                    myResolve([-1, data[i].country.name]);
                                                })
                                        }
                                    }
                                })
                                .catch((err) => {
                                    data[i].country.updateStatus = false;
                                    myResolve([-1, data[i].country.name]);
                                })
                        }))
                    }
                }
                Promise.all(promises).then((values) => {
                    const updatesCount = values.filter((element) => element[0] === 1).length;
                    let errorsList = values.filter((element) => element[0] === -1);
                    errorsList = errorsList.map((element) => {
                        return element[1];
                    })
                    const errorsCount = errorsList.length;

                    if (promises.length > 0) {
                        if (file) {
                            fs.writeFile(filePath, JSON.stringify(data, null, 3), (err) => {
                                return res.status(200).json({
                                    status: "success",
                                    error: "",
                                    message: {
                                        recordsNeedUpdate: promises.length,
                                        updatesCount,
                                        errorsCount,
                                        errorsList,
                                        fileUpdated: !err
                                    }
                                })
                            })
                        }
                        else {
                            return res.status(200).json({
                                status: "success",
                                error: "",
                                message: {
                                    recordsNeedUpdate: promises.length,
                                    updatesCount,
                                    errorsCount,
                                    errorsList,
                                    fileUpdated: false
                                }
                            })
                        }
                    }
                    else {
                        res.status(200).json({
                            status: "success",
                            error: "",
                            message: {
                                recordsNeedUpdate: promises.length,
                                updatesCount,
                                errorsCount,
                                errorsList,
                                fileUpdated: false
                            }
                        })
                    }
                })
            })
            .catch((err) => {
                internalError(req, res, err);
            })
    }
    catch (err) {
        internalError(req, res, err);
    }
}

const getPriceCatalog = async (req, res) => {
    try {
        const {aggregator} = await req.body;
        if (aggregator === undefined) {
            return res.status(400).json({
                status: "failed",
                error: req.i18n.t('admin.aggregatorRequired'),
                message: {}
            })
        }
        PriceCatalog.find({'aggregators.name': aggregator}, {_id: 0, country: 1, 'aggregators.$': 1}).sort({country: 1})
            .then((data) => {
                data = data.map((element) => {
                    element = element.toJSON();
                    const countryName = element.country;
                    element.country = undefined;
                    element.country = {};
                    element.country.name = countryName;
                    element.country.price = Number(element.aggregators[0].price);
                    element.country.isActive = element.aggregators[0].isActive;
                    element.aggregators = undefined;
                    return element;
                })
                const activeCount = data.filter((element) => element.country.isActive).length;
                const inactiveCount = data.filter((element) => !element.country.isActive).length;
                res.status(200).json({
                    status: "success",
                    error: "",
                    message: {
                        totalCount: data.length,
                        activeCount,
                        inactiveCount,
                        priceCatalog: data
                    }
                })
            })
            .catch((err) => {
                internalError(req, res, err);
            })
    }
    catch (err) {
        internalError(req, res, err);
    }
}

const getBestPrice = async (country) => {
    return new Promise((myResolve, myReject) => {
        getAggregators()
            .then((aggregators) => {
                PriceCatalog.findOne({country}, {_id: 0, aggregators: 1})
                    .then((priceCatalog) => {
                        aggregators = aggregators.map((element) => element.name)
                        let {aggregators: countryAggregators} = priceCatalog;
                        let completed = false;
                        while (!completed && countryAggregators.length > 0) {
                            for (let i in countryAggregators) {
                                if (!countryAggregators[i].isActive ||
                                    !aggregators.some(str => str.includes(countryAggregators[i].name))) {
                                    countryAggregators.splice(i, 1);
                                    break;
                                }
                                if (i == countryAggregators.length - 1) {
                                    completed = true;
                                }
                            }
                        }
                        if (countryAggregators.length === 0) {
                            return myReject('No service provider selected');
                        }
                        const minPrice = Math.min(...countryAggregators.map((element) => Number(element.price)));
                        const selectedAggregator = countryAggregators.filter((element) =>
                            Number(element.price) === minPrice
                        )
                        myResolve({aggregator: selectedAggregator[0].name, price: Number(selectedAggregator[0].price)});
                    })
                    .catch((err) => {
                        myReject(err);
                    })
            })
            .catch((err) => {
                myReject(err);
            })
    })
}

const internalError = (req, res, err) => {
    res.status(500)
        .json({
            status: "failed",
            error: req.i18n.t('general.internalError'),
            message: {
                info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
            }
        })
}

module.exports = {updatePriceCatalog, getPriceCatalog, getBestPrice};