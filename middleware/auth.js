const jwt = require('jsonwebtoken');
const Token = require('../controllers/tokens');

const secretKey = process.env.SECURITY_SECRET_KEY;
const accessTokenExpiry = process.env.SECURITY_ACCESS_TOKEN_EXPIRY;
const renewTokenExpiry = process.env.SECURITY_RENEW_TOKEN_EXPIRY;
const product = process.env.GENERAL_PRODUCT_NAME

const authorize = (tokenType, roles = []) => {

    return (req, res, next) => {
        roles = roles.map((role) => role.toUpperCase())

        const sendError = (error) => {
            res.status(403)
                .json({
                    status: "failed",
                    error,
                    message: {}
                });
        };

        try {
            const token = req.headers["Authorization"] || req.headers["authorization"];

            if (!token) {
                if (roles.indexOf('GUEST') !== -1) {
                    req.body.user = {role: 'Guest'};
                    next();
                    return;
                }
                return sendError(req.i18n.t('security.tokenNotFound'));
            }

            if (token.indexOf("Bearer") !== 0) {
                return sendError(req.i18n.t('security.invalidToken'));
            }

            const tokenString = token.split(" ")[1];
            jwt.verify(tokenString, secretKey, async (err, payload) => {
                const sendError = (error) => {
                    res.status(403)
                        .json({
                            status: "failed",
                            error,
                            message: {}
                        });
                };

                if (err) {
                    return sendError(req.i18n.t('security.badToken'));
                }

                if (payload.type !== tokenType) {
                    return sendError(req.i18n.t('security.wrongTokenType'));
                }

                if (payload.type === 'Access') {
                    if (!payload.role) {
                        return sendError(req.i18n.t('security.roleNotFound'));
                    }
                    if (roles.indexOf(payload.role) === -1) {
                        return sendError(req.i18n.t('security.notAuthorized'));
                    }
                    req.body.user = payload;
                    next();
                }
                else {
                    await Token.validateToken(tokenString)
                        .then((result) => {
                            if (!result) {
                                return sendError(req.i18n.t('security.InvalidatedToken'));
                            }
                            req.body.user = payload;
                            next();
                        })
                        .catch((err) => {
                            res.status(500)
                                .json({
                                    status: "failed",
                                    error: req.i18n.t('general.internalError'),
                                    message: {
                                        info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
                                    }
                                })
                        })
                }
            })

        }
        catch (err) {
            res.status(500)
                .json({
                    status: "failed",
                    error: req.i18n.t('general.internalError'),
                    message: {
                        info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
                    }
                })
        }
    }
}

const issueAccessToken = (user) => {
    try {
        const {_id: id, firstName, lastName, role} = user;
        return jwt.sign({id, firstName, lastName, role, type: 'Access', iss: product},
            secretKey,
            {expiresIn: accessTokenExpiry});
    }
    catch (err) {
        return 'Error';
    }
};

const issueRenewToken = (user) => {
    return new Promise((myResolve, myReject) => {
        try {
            const {_id: id, firstName, lastName, role} = user;
            const payload = {id, firstName, lastName, role, type: 'Renew', iss: product};
            const token = jwt.sign(payload, secretKey, {expiresIn: renewTokenExpiry});
            Token.createToken(id, token, 'Renew')
                .then(() => {
                    myResolve(token);
                })
        }
        catch (err) {
            myReject();
        }
    })
};

const issueApiToken = (user) => {
    return new Promise((myResolve, myReject) => {
        try {
            const {_id: id} = user;
            const payload = {id, type: 'Api', iss: product};
            const token = jwt.sign(payload, secretKey);
            Token.createToken(id, token, 'Api')
                .then(() => {
                    myResolve(token);
                })
        }
        catch (err) {
            myReject();
        }
    })
};

module.exports = {issueAccessToken, issueRenewToken, issueApiToken, authorize};

