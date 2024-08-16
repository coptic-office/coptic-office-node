const Plan = require('../models/plans');

const getSellingPrice = (planName, productsList) => {
    return new Promise(async (myResolve, myReject) => {
        let totalPrice = 0.00;
        const productsSet = new Set(productsList);
        for (const product of productsSet) {
            const count = productsList.filter((item) => item === product).length;
            await Plan.findOne({name: planName, 'products.code': product}, {_id: 0, 'products.$': 1})
                .then((targetProduct) => {
                    if (targetProduct) {
                        totalPrice += Number(targetProduct.products[0].price) * count;
                    }
                })
                .catch((err) => {
                    myReject(err);
                })
        }
        myResolve(totalPrice.toFixed(3));
    })
}

const getPlanPrice = (planName) => {
    return new Promise( async (myResolve, myReject) => {
        await Plan.findOne({name: planName}, {_id: 0, monthlyFee: 1})
            .then((plan) => {
                if (!plan) {
                    myReject('unavailablePlan');
                }
                myResolve({price: Number(plan.monthlyFee)});
            })
            .catch((err) => {
                myReject(err);
            })
    })
}

const getPlans = async (req, res) => {
    try {
        await Plan.find({isActive: true}, {_id: 0, isActive: 0})
            .then((plansList) => {
                const plans = [];
                for (const plan of plansList) {
                    let item = {};
                    item.products = [];
                    item.name = plan.name;
                    item.details = req.i18n.t(`item.${plan.name}`);
                    item.price = Number(plan.monthlyFee);
                    for (const product of plan.products) {
                        const subItem = {};
                        subItem.code = product.code;
                        subItem.price = Number(product.price);
                        subItem.name = req.i18n.t(`product.${product.code}.name`);
                        subItem.brief = req.i18n.t(`product.${product.code}.brief`);
                        subItem.description = req.i18n.t(`product.${product.code}.description`);
                        item.products.push(subItem);
                    }
                    plans.push(item);
                }
                res.status(200).json({
                    status: "success",
                    error: "",
                    message: {
                        plans
                    }
                })
            })
            .catch((err) => {
                throw new Error(err);
            })
    }
    catch (err) {
        res.status(500).json({
            status: "failed",
            error: req.i18n.t('general.internalError'),
            message: {
                info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
            }

        })
    }
}

const getPlan = async (req, res) => {
    try {
        const {planName} = await req.body;

        if (planName === undefined) {
            return res.status(400)
                .json({
                    status: "failed",
                    error: req.i18n.t(`subscription.planRequired`),
                    message: {}
                })
        }

        await Plan.findOne({name: planName, isActive: true}, {_id: 0})
            .then((plan) => {
                if (!plan) {
                    return res.status(404).json({
                        status: "failed",
                        error: req.i18n.t('subscription.unavailablePlan'),
                        message: {}
                    })
                }
                else {
                    let item = {};
                    item.products = [];
                    item.name = plan.name;
                    item.details = req.i18n.t(`item.${plan.name}`);
                    item.price = Number(plan.monthlyFee);
                    for (const product of plan.products) {
                        const subItem = {};
                        subItem.code = product.code;
                        subItem.price = Number(product.price);
                        subItem.name = req.i18n.t(`product.${product.code}.name`);
                        subItem.brief = req.i18n.t(`product.${product.code}.brief`);
                        subItem.description = req.i18n.t(`product.${product.code}.description`);
                        item.products.push(subItem);
                    }
                    res.status(200).json({
                        status: "success",
                        error: "",
                        message: {
                            plan: item
                        }
                    })
                }
            })
            .catch((err) => {
                throw new Error(err);
            })
    }
    catch (err) {
        res.status(500).json({
            status: "failed",
            error: req.i18n.t('general.internalError'),
            message: {
                info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
            }

        })

    }
}

module.exports = {getSellingPrice, getPlanPrice, getPlans, getPlan};