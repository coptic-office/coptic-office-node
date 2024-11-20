
const isNumeric = (value) => {
    return /^-?[0-9]+$/.test(value);
}

const isFloat = (value) => {
    return /^-?[0-9]+\.?[0-9]*$/.test(value);
}

module.exports = {isNumeric, isFloat};