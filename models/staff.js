const {Schema, model} = require('mongoose');
const bcrypt = require('bcrypt');

const staffSchema = new Schema({
    firstName: String,
    lastName: String,
    mobile: {
        primary: {country: String, number: String}
    },
    profilePhoto: {
        type: String,
        default: process.env.GENERAL_DEFAULT_PROFILE
    },
    email: {
        primary: String,
    },
    jobTitle: String,
    password: {
        type: String,
        validate: {
            validator: (value) => {
                const pattern = process.env.SECURITY_STAFF_PASSWORD_PATTERN
                const regex = new RegExp(pattern)
                return regex.test(value)
            },
            message: 'invalidPassword'
        }
    },
    role: {
        type: String,
        enum: {
            values: ['ADMIN', 'EMPLOYEE', 'SUPERVISOR', 'MANAGER'],
            message: 'invalidRole'
        }
    },
    isActive: {
        isSuspended: {
            type: Boolean,
            default: false
        },
        login: {
            failedTrials: {
                type: Number,
                default: 0
            },
            nextTrial: {
                type: Date,
                default: new Date()
            }
        },
        message: String
    },
});

staffSchema.pre('validate', function(next) {
    const staff = this;
    if (!staff.isModified('role')) return next();

    this.role = this.role.toUpperCase();
    next();
});

staffSchema.pre('save', function(next) {
    const staff = this;

    // only hash the password if it has been modified (or is new)
    if (!staff.isModified('password')) return next();
    const saltWorkFactor = Number(process.env.SECURITY_SALT_WORK_FACTOR);
    const pepperedPassword = staff.password + process.env.SECURITY_PASSWORD_PEPPER

    // generate a salt
    bcrypt.genSalt(saltWorkFactor, (err, salt) => {
        if (err) return next(err);

        bcrypt.hash(pepperedPassword, salt, (err, hash) => {
            if (err) return next(err);

            // override the cleartext password with the hashed one
            staff.password = hash;
            next();
        })
    })
})

staffSchema.methods.comparePassword = function(candidatePassword, cb) {

    const pepperedPassword = candidatePassword + process.env.SECURITY_PASSWORD_PEPPER

    bcrypt.compare(pepperedPassword, this.password, function(err, isMatch) {
        if (err) return cb(err);
        cb(null, isMatch);
    });
};

const staffModel = model('staff', staffSchema);

module.exports = staffModel;

