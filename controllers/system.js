const debug = require('debug');
const errorLog = debug('app-system:error');
const User = require("./users");

const updatePersonImagesCB = async (req, res) => {
    try {
        const {userId, personId, index, encodingIndex} = await req.body;
        await User.getPersonData(userId, personId)
            .then(async (person) => {
                const imagesList = person.images;
                imagesList[index] = encodingIndex;
                await User.updatePersonData(userId, personId, {images: imagesList})
                    .then(() => {
                        return res.status(200).json({
                            status: "success",
                            error: "",
                            message: {}
                        })
                    })
                    .catch((err) => {
                        throw new Error(err.toString());
                    })
            })
            .catch((err) => {
                throw new Error(err.toString());
            })
    }
    catch (err) {
        errorLog(err.toString());
        res.status(500).json({
            status: "Failed",
            error: err.toString(),
            message: {}
        })
    }
}

const updatePersonImagesCallback = async (req, res) => {
    try {
        const {status, error, fileName, userId, person: {id, firstName, lastName}} = await req.body;

        console.log(`Status: ${status}`)
        console.log(`Error: ${error}`)
        console.log(`File Name: ${fileName}`)
        console.log(`User ID: ${userId}`)
        console.log(`Person ID: ${id}`)
        console.log(`First Name: ${firstName}`)
        console.log(`Last Name: ${lastName}`)
    }
    catch (err) {
        console.log('Error while calling callback function')
    }
}

module.exports = {updatePersonImagesCB, updatePersonImagesCallback}