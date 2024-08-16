const {Schema, model} = require('mongoose');

const renewalInterval = Number(process.env.OTP_RENEWAL_IN_HOURS) * (60 * 60 * 1000);
const smsStartingDelay = Number(process.env.OTP_SMS_STARTING_DELAY);
const emailStartingDelay = Number(process.env.OTP_EMAIL_STARTING_DELAY);

const preUserSchema = new Schema({
    otpReceiver: {
        recipient: String,
        country: {
            type: String,
            default: "None"
        }
    },
    otp: String,
    otpDelay: Number,
    otpResend: Date,
    otpRenewal: {
        type: Date,
        default: () => new Date(new Date().getTime() + renewalInterval)
    },
    wrongTrials: {type: Number, default: 0},
    action: {
        type: String,
        required: true,
        enum: {
            values: ['REGISTER', 'UPDATE', 'PASSWORD']
        }
    },
    verificationCode: String,
    callback: String
})

preUserSchema.pre('save', function(next) {
    this.otpDelay = this.otpReceiver['country'] === 'None' ? emailStartingDelay : smsStartingDelay;
    this.otpResend = new Date(new Date().getTime() + (this.otpDelay * 60 * 1000));
    next();
});

const preUserModel = model('pre_user', preUserSchema);

module.exports = preUserModel;