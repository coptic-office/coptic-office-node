const {Schema, model} = require('mongoose');
const bcrypt = require('bcrypt');
const mongoose = require("mongoose");

const userSchema = new Schema({
    firstName: {
        type: String,
        required: [true, 'firstNameRequired'],
        maxLength: [20, 'nameMaxLength'],
    },
    lastName: {
        type: String,
        required: [true, 'lastNameRequired'],
        maxLength: [20, 'nameMaxLength'],
    },
    mobile: {
        primary: {country: String, number: String},
        isVerified: Boolean,
        alternate: {country: String, number: String},
    },
    profilePhoto: {
        type: String,
        default: process.env.GENERAL_DEFAULT_PROFILE
    },
    identification: {
        nationalId: {
            front: String,
            back: String
        }
    },
    currency: {
        type: String,
        default: process.env.GENERAL_BASE_CURRENCY
    },
    email: {
        primary: {
            type: String,
            validate: {
                validator: (value) => {
                    return /^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/.test(value)
                },
                message: 'invalidEmail'
            }
        },
        isVerified: Boolean,
        alternate: String
    },
    password: {
        type: String,
        required: [true, 'passwordRequired'],
        validate: {
            validator: (value) => {
                const pattern = process.env.SECURITY_PASSWORD_PATTERN
                const regex = new RegExp(pattern)
                return regex.test(value)
            },
            message: 'invalidPassword'
        }
    },
    payments: [
        {
            _id: false,
            id: String,
            paymentMethod: {
                type: String,
                enum: {
                    values: ['bankDeposit', 'bankTransfer', 'instaPay', 'creditCard']
                }
            },
            paymentType: {
                type: String,
                enum: {
                    values: ['booking', 'contracting', 'cashing']
                }
            },
            amount: mongoose.Decimal128,
            adviceDate: Date,
            unitId: String
        }
    ],
    units: [
        {
            _id: false,
            id: String,
            unitNumber: String,
            category: {
                type: String,
                enum: {
                    values: ['category1', 'category2', 'category3']
                }
            },
            priceDetails: [
                {
                    _id: false,
                    category: {
                        type: String,
                        enum: {
                            values: ['category1', 'category2', 'category3']
                        }
                    },
                    bookingAmount: Number,
                    contractingAmount: Number,
                    grossAmount: Number,
                    cashAmount: Number,
                    installments: {
                        count: Number,
                        amount: Number,
                        spanInMonths: Number
                    }
                }
            ],
            bookingDate: Date,
            contractingDate: Date,
            contractDate: Date,
            completionDate: Date,
            bankChecks: [
                {
                    _id: false,
                    number: String,
                    dueDate: Date,
                    amount: Number,
                    bankName: String,
                    status: String,
                    image: String,
                    staffID: String,
                    date: Date
                }
            ],
            info: {
                ar: String,
                en: String,
                value: String
            }
        }
    ],
    notifications: {
        newCount: {
            type: Number,
            default: 0
        },
        messages: [
            {
                _id: false,
                ar: String,
                en: String,
                date: Date,
                isRead: Boolean,
                staffID: String
            }
        ]
    },
    role: {
        type: String,
        required: [true, 'roleRequired'],
        enum: {
            values: ['ADMIN', 'USER'],
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

userSchema.pre('validate', function(next) {
    const user = this;
    if (!user.isModified('role')) return next();

    this.role = this.role.toUpperCase();
    next();
});

userSchema.pre('save', function(next) {
    const user = this;

    // only hash the password if it has been modified (or is new)
    if (!user.isModified('password')) return next();
    const saltWorkFactor = Number(process.env.SECURITY_SALT_WORK_FACTOR);
    const pepperedPassword = user.password + process.env.SECURITY_PASSWORD_PEPPER

    // generate a salt
    bcrypt.genSalt(saltWorkFactor, (err, salt) => {
        if (err) return next(err);

        bcrypt.hash(pepperedPassword, salt, (err, hash) => {
            if (err) return next(err);

            // override the cleartext password with the hashed one
            user.password = hash;
            next();
        })
    })
})

userSchema.methods.comparePassword = function(candidatePassword, cb) {

    const pepperedPassword = candidatePassword + process.env.SECURITY_PASSWORD_PEPPER

    bcrypt.compare(pepperedPassword, this.password, function(err, isMatch) {
        if (err) return cb(err);
        cb(null, isMatch);
    });
};

const userModel = model('user', userSchema);

module.exports = userModel;

