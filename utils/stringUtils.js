const stringInject = (str, data) => {
    if (typeof str === 'string' && (data instanceof Array)) {
        return str.replace(/({\d})/g, function(i) {
            return data[i.replace(/{/, '').replace(/}/, '')];
        });
    }
    else if (typeof str === 'string' && (data instanceof Object)) {
        if (Object.keys(data).length === 0) {
            return str;
        }

        for (let key in data) {
            return str.replace(/({([^}]+)})/g, function(i) {
                let key = i.replace(/{/, '').replace(/}/, '');
                if (!data[key]) {
                    return i;
                }
                return data[key];
            });
        }
    }
    else if (typeof str === 'string' && !(data instanceof Array) || typeof str === 'string' && !(data instanceof Object)) {
        return str;
    }
    else {
        return false;
    }
}

module.exports = {stringInject};