const appLanguages = [
    {
        language: 'English',
        code: 'en'
    },
    {
        language: 'Arabic',
        code: 'ar'
    }
]

const smsLanguages = [
    {
        language: 'English',
        code: 'en',
        otpMessage: 'Your verification code is: {otp}'
    },
    {
        language: 'Arabic',
        code: 'ar',
        otpMessage: 'رمز التحقق الخاص بك هو: {otp}'
    },
    {
        language: 'Spanish',
        code: 'es',
        otpMessage: 'Tu código de verificación es: {otp}'
    },
    {
        language: 'Portuguese',
        code: 'pt',
        otpMessage: 'Seu código de verificação é: {otp}'
    },
    {
        language: 'French',
        code: 'fr',
        otpMessage: 'Votre code de vérification est: {otp}'
    },
    {
        language: 'German',
        code: 'de',
        otpMessage: 'Ihr Bestätigungscode lautet: {otp}'
    },
    {
        language: 'Italian',
        code: 'it',
        otpMessage: 'Il tuo codice di verifica è: {otp}'
    },
    {
        language: 'Hindi',
        code: 'hi',
        otpMessage: 'आपका सत्यापन कोड है: {otp}'
    },
    {
        language: 'Turkish',
        code: 'tr',
        otpMessage: 'Doğrulama kodunuz: {otp}'
    },
    {
        language: 'Russian',
        code: 'ru',
        otpMessage: 'Ваш код подтверждения: {otp}'
    },
    {
        language: 'Japanese',
        code: 'ja',
        otpMessage: 'あなたの確認コードは: {otp}'
    },
]

module.exports = {appLanguages, smsLanguages};
