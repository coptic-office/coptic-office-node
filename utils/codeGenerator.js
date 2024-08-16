const crypto = require('crypto');

const generateNumber = (size) => {

    const add = 1
    // 12 is the min safe number Math.random() can generate without it starting to pad the end with zeros
    let max = 12 - add;

    if ( size > max ) {
        return generateNumber(max) + generateNumber(size - max);
    }

    max = Math.pow(10, size + add);
    const min = max/10; // Math.pow(10, n) basically
    const number = Math.floor( Math.random() * (max - min + 1) ) + min;

    return ("" + number).substring(add)
}

const separateNumber = (number, separator) => {
    return number.replace(/.{1}/g, `$&${separator}`).slice(0, -1)
}

const generateUUID = () => {
    return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, c =>
        (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
    );
}

module.exports = {generateNumber, separateNumber, generateUUID};