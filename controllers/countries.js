const Country = require('../models/countries');

const getCountry = async (options) => {
    return new Promise((myResolve, myReject) => {
        Country.findOne({...options, isActive: true}, {_id: 0, __v: 0, isActive: 0})
            .then((country) => {
                myResolve(country);
            })
            .catch((err) => {
                myReject(err);
            })
    })
}

const getCountries = async () => {
    return new Promise((myResolve, myReject) => {
        Country.find({isActive: true}, {_id: 0, name: 1, code: 1})
            .then((countries) => {
                countries = countries.map((country) => country._doc)
                countries = countries.map(({
                    name: country, ...rest}) => ({
                    country, ...rest
                }));
                myResolve(sortCountries(countries, 'country'));
            })
            .catch((err) => {
                myReject(err);
            })
    })
}

const listCountries = async (req, res) => {
    Country.find({isActive: true}, {_id: 0, name: 1, code: 1})
        .then((countries) => {
            res.status(200).json({
                status: "success",
                error: "",
                message: {
                    countries: sortCountries(countries, 'name')
                }
            })
        })
        .catch((err) => {
            internalError(req, res, err);
        })
}

const sortCountries = (countries, key) => {
    return countries.sort((a, b) => {
        const nameA = a[key].toUpperCase();
        const nameB = b[key].toUpperCase();
        if (nameA < nameB) {
            return -1;
        }
        if (nameA > nameB) {
            return 1;
        }
        return 0;
    })
}

const internalError = (req, res, err) => {
    res.status(500)
        .json({
            status: "failed",
            error: req.i18n.t('general.internalError'),
            message: {
                description: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
            }
        })
}

module.exports = {getCountry, getCountries, listCountries};