const crypto = require('crypto');

const encrypt = (plainText) => {
    const secretKey = process.env.SECURITY_SECRET_KEY;
    const salt = process.env.SECURITY_SALT_WORK_FACTOR;
    const algorithm = 'aes-192-cbc'         //for 'des-ede3' set iv = null
    const iv = Buffer.alloc(16, 0);
    const key = crypto.scryptSync(secretKey, salt, 24);
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    let cipherText = cipher.update(plainText, 'utf8', 'hex');
    cipherText += cipher.final('hex');
    return cipherText;
}

const decrypt = (cipherText) => {
    const secretKey = process.env.SECURITY_SECRET_KEY;
    const salt = process.env.SECURITY_SALT_WORK_FACTOR;
    const algorithm = 'aes-192-cbc'         //for 'des-ede3' set iv = null
    const iv = Buffer.alloc(16, 0);
    const key = crypto.scryptSync(secretKey, salt, 24);
    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    let decrypted = decipher.update(cipherText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

module.exports = {encrypt, decrypt}