const dns = require('dns');

const verifyDomainName = (domainName) => {
    return new Promise((myResolve, myReject) => {
        dns.resolveTxt(domainName, (err, records) => {
                if (err) {
                    if (err.code === 'ENOTFOUND') {
                        myReject('user.domainNotFound')
                    }
                    if (err.code === 'ENODATA') {
                        myReject('user.senderNotVerified')
                    }
                    myReject(err);
                }
                else {
                    records.find((element) => {
                        if (element.indexOf(process.env.USER_DOMAIN_VERIFICATION_TXT) !== -1) {
                            myResolve('user.senderVerified');
                        }
                    })
                    myReject('user.senderNotVerified')
                }
        })
    })
}

module.exports = {verifyDomainName};