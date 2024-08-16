const debug = require('debug');
const log = debug('app-currencyRates:info');
const errorLog = debug('app-currencyRates:error');
const axios = require('axios');


let currencyRates = []

const getCurrencyRate = (from, to) => {
    return new Promise((myResolve, myReject) => {

        if (from === to ) {
            myResolve("1");
            return;
        }

        const result = currencyRates.find((currencyRate) => currencyRate.currencyPair === `${from}/${to}`)
        const refreshInterval = Number(process.env.FOREX_REFRESH_IN_HOURS) * (60 * 60 * 1000)
        if (result !== undefined && new Date() < new Date(result.lastUpdated.getTime() + refreshInterval)) {
            myResolve(result.rate)
        }
        else {
            let url = 'https://www.alphavantage.co/query?function=CURRENCY_EXCHANGE_RATE';
            url += `&from_currency=${from}`;
            url += `&to_currency=${to}`;
            url += `&apikey=${process.env.FOREX_API_KEY}`

            axios.get(url)
                .then((res) => {
                    if (res.data['Error Message'] === undefined) {
                        const rate = res.data['Realtime Currency Exchange Rate']['5. Exchange Rate']
                        if (result !== undefined) {
                            currencyRates = currencyRates.map((obj) => {
                                if (obj === result) {
                                    obj.rate = rate;
                                    obj.lastUpdated = new Date();
                                }
                                return obj;
                            })
                        }
                        else {
                            currencyRates.push({
                                currencyPair: `${from}/${to}`,
                                rate,
                                lastUpdated: new Date()
                            })
                        }
                        console.log(currencyRates)
                        myResolve(rate);
                    } else {
                        errorLog(res.data['Error Message']);
                        myReject(res.data['Error Message']);
                    }
                })
                .catch((err) => {
                    errorLog(err);
                    myReject(err);
                })
        }
    })
}

module.exports = getCurrencyRate;