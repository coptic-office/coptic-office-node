const debug = require('debug');
const errorLog = debug('app-emailSender:error');
const nodemailer = require('nodemailer');
const MailGen = require('mailgen');

// const transporter = nodemailer.createTransport({
//     service: 'gmail',
//     auth: {
//         user: process.env.EMAIL_GMAIL_APP_USER,
//         pass: process.env.EMAIL_GMAIL_APP_PASSWORD
//     }
// })

const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_SMTP_SERVER,
    secure: true,
    auth: {
        user: process.env.EMAIL_USER_NAME,
        pass: process.env.EMAIL_PASSWORD
    }
})

const sendOTP = (req, params) => {
    const arabicDirection = req.headers["accept-language"] === 'ar'
    const year = new Date().getFullYear()
    const productName = process.env.GENERAL_PRODUCT_NAME
    const mailGenerator = new MailGen({
        theme: 'default',
        textDirection: arabicDirection ? 'rtl' : 'ltr',
        product: {
            name: process.env.GENERAL_PRODUCT_NAME,
            link: process.env.GENERAL_PRODUCT_LINK,
            logo: process.env.GENERAL_LOGO_LINK,
            copyright: req.i18n.t('email.copyright', {year, productName}),
        }
    });

    let intro1 = '';
    switch (params.action) {
        case 'REGISTER':
            intro1 = req.i18n.t('email.otp.introRegister', {productName});
            break;
        case 'UPDATE':
            intro1 = req.i18n.t('email.otp.introUpdate');
            break;
        case 'PASSWORD':
            intro1 = req.i18n.t('email.otp.introPassword');
            break;
    }

    const email = {
        body: {
            greeting: req.i18n.t('email.greeting'),
            name: `${params.firstName}`,
            intro: [intro1, req.i18n.t('email.otp.intro2', {otp: params.otp})],
            outro: params.outro === 'Show' ? req.i18n.t('email.otp.outro') : '',
            signature: req.i18n.t('email.signature')
        }
    }
    const emailBody = mailGenerator.generate(email);

    // require('fs').writeFileSync('preview.html', emailBody, 'utf8');

    return new Promise((myResolve, myReject) => {

        const message = {
            from: process.env.EMAIL_USER_NAME,
            to: params.receiver,
            subject: req.i18n.t('email.otp.subject'),
            html: emailBody
        };

        transporter.sendMail(message)
            .then((res) => {
                myResolve(res);
            })
            .catch((err) => {
                errorLog(`A ${params.template} email failed to be sent to ${params.receiver}`);
                myReject(err);
            })
    })
}

const sendPaymentReceipt = (req, params) => {

    const arabicDirection = req.headers["accept-language"] === 'ar'
    const year = new Date().getFullYear()
    const productName = process.env.GENERAL_PRODUCT_NAME
    const mailGenerator = new MailGen({
        theme: 'default',
        textDirection: arabicDirection ? 'rtl' : 'ltr',
        product: {
            name: process.env.GENERAL_PRODUCT_NAME,
            link: process.env.GENERAL_PRODUCT_LINK,
            logo: process.env.GENERAL_LOGO_LINK,
            copyright: req.i18n.t('email.copyright', {year, productName}),
        }
    });

    const bookingExpiry = params.bookingExpiry !== null
    const item = req.i18n.t('email.paymentReceipt.item')
    const description = req.i18n.t('email.paymentReceipt.description')
    const amount = req.i18n.t('email.paymentReceipt.amount')

    const email = {
        body: {
            greeting: req.i18n.t('email.greeting'),
            name: `${params.firstName}`,
            intro: req.i18n.t('email.paymentReceipt.intro'),
            table: {
                data: [
                    {
                        [item]: params.items[0].name,
                        [description]: params.items[0].description,
                        [amount]: params.items[0].amount
                    }
                ],
                columns: {
                    customAlignment: {
                        [item]: arabicDirection ? 'right' : 'center',
                        [description]: arabicDirection ? 'right' : 'center',
                        [amount]: arabicDirection ? 'center' : 'right'
                    }
                }
            },
            action: {
                instructions: req.i18n.t('email.paymentReceipt.actionInstructions'),
                button: {
                    color: `#${process.env.THEME_SECONDARY_COLOR}`,
                    text: req.i18n.t('email.paymentReceipt.actionText'),
                    link: 'https://www.propertiano.com'
                }
            },
            outro: [
                bookingExpiry ? req.i18n.t('email.paymentReceipt.outro1', {bookingExpiry: params.bookingExpiry}) : '',
                req.i18n.t('email.paymentReceipt.outro2', {paymentReference: params.paymentReference})
            ],
            signature: req.i18n.t('email.signature')
        }
    }

    const emailBody = mailGenerator.generate(email);

    require('fs').writeFileSync('preview.html', emailBody, 'utf8');

    return new Promise((myResolve, myReject) => {

        const message = {
            from: process.env.EMAIL_USER_NAME,
            to: params.receiver,
            subject: req.i18n.t('email.paymentReceipt.subject'),
            html: emailBody
        };

        transporter.sendMail(message)
            .then((res) => {
                myResolve(res);
            })
            .catch((err) => {
                errorLog(`A ${params.template} email failed to be sent to ${params.receiver}`);
                myReject(err);
            })
    })
}

const sendEmail = (req, params) => {
    return new Promise((myResolve, myReject) => {
        switch (params.template) {
            case 'OTP':
                sendOTP(req, params).then((res) => myResolve(res)).catch((err) => myReject(err));
                break;
            case 'Payment Receipt':
                sendPaymentReceipt(req, params).then((res) => myResolve(res)).catch((err) => myReject(err));
                break;
        }
    })
}

module.exports = sendEmail;

