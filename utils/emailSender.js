const debug = require('debug');
const errorLog = debug('app-emailSender:error');
const nodemailer = require('nodemailer');
const MailGen = require('mailgen');
const i18n = require('i18next');

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

const sendOTP = (locale, params) => {
    const arabicDirection = locale === 'ar';
    const year = new Date().getFullYear();
    const productName = arabicDirection ? process.env.GENERAL_PRODUCT_NAME_ARABIC : process.env.GENERAL_PRODUCT_NAME;
    const mailGenerator = new MailGen({
        theme: 'default',
        textDirection: arabicDirection ? 'rtl' : 'ltr',
        product: {
            name: productName,
            link: process.env.GENERAL_PRODUCT_LINK,
            logo: process.env.GENERAL_LOGO_WHITE_LINK,
            copyright: i18n.t('email.copyright', {year, productName, lng: locale}),
        }
    });

    let intro1 = '';
    switch (params.action) {
        case 'REGISTER':
            intro1 = i18n.t('email.otp.introRegister', {productName, lng: locale});
            break;
        case 'UPDATE':
            intro1 = i18n.t('email.otp.introUpdate', {lng: locale});
            break;
        case 'PASSWORD':
            intro1 = i18n.t('email.otp.introPassword', {lng: locale});
            break;
    }

    const email = {
        body: {
            greeting: i18n.t('email.greeting', {lng: locale}),
            name: `${params.firstName}`,
            intro: [intro1, i18n.t('email.otp.intro2', {otp: params.otp, lng: locale})],
            outro: params.outro === 'Show' ? i18n.t('email.otp.outro', {lng: locale}) : '',
            signature: i18n.t('email.signature', {lng: locale})
        }
    }
    const emailBody = mailGenerator.generate(email);

    // require('fs').writeFileSync('preview.html', emailBody, 'utf8');

    return new Promise((myResolve, myReject) => {

        const message = {
            from: process.env.EMAIL_USER_NAME,
            to: params.receiver,
            subject: i18n.t('email.otp.subject', {lng: locale}),
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

const sendPaymentReceipt = (locale, params) => {

    const arabicDirection = locale === 'ar'
    const year = new Date().getFullYear()
    const productName = arabicDirection ? process.env.GENERAL_PRODUCT_NAME_ARABIC : process.env.GENERAL_PRODUCT_NAME;
    const mailGenerator = new MailGen({
        theme: 'default',
        textDirection: arabicDirection ? 'rtl' : 'ltr',
        product: {
            name: productName,
            link: process.env.GENERAL_PRODUCT_LINK,
            logo: process.env.GENERAL_LOGO_WHITE_LINK,
            copyright: i18n.t('email.copyright', {year, productName, lng: locale}),
        }
    });

    const item = i18n.t('email.paymentReceipt.item', {lng: locale})
    const description = i18n.t('email.paymentReceipt.description', {lng: locale})
    const amount = i18n.t('email.paymentReceipt.amount', {lng: locale})

    const email = {
        body: {
            greeting: i18n.t('email.greeting', {lng: locale}),
            name: `${params.firstName}`,
            intro: i18n.t('email.paymentReceipt.intro', {lng: locale}),
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
                instructions: i18n.t('email.paymentReceipt.actionInstructions', {lng: locale}),
                button: {
                    color: `#${process.env.THEME_SECONDARY_COLOR}`,
                    text: i18n.t('email.paymentReceipt.actionText', {lng: locale}),
                    link: `https://web.copticoffice.com/${locale}/payments#mypayments`
                }
            },
            outro: [
                i18n.t('email.paymentReceipt.outro1', {paymentReference: params.paymentReference, lng: locale}),
                i18n.t('email.paymentReceipt.outro2', {lng: locale})
            ],
            signature: i18n.t('email.signature', {lng: locale})
        }
    }

    const emailBody = mailGenerator.generate(email);

    // require('fs').writeFileSync('preview.html', emailBody, 'utf8');

    return new Promise((myResolve, myReject) => {

        const message = {
            from: process.env.EMAIL_USER_NAME,
            to: params.receiver,
            subject: i18n.t('email.paymentReceipt.subject', {lng: locale}),
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

const sendEmail = (locale, params) => {
    return new Promise((myResolve, myReject) => {
        switch (params.template) {
            case 'OTP':
                sendOTP(locale, params).then((res) => myResolve(res)).catch((err) => myReject(err));
                break;
            case 'Payment Receipt':
                sendPaymentReceipt(locale, params).then((res) => myResolve(res)).catch((err) => myReject(err));
                break;
        }
    })
}

module.exports = sendEmail;

