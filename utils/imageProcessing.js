const sharp = require('sharp');

const compress = (buffer, width) => {
    return new Promise(async (myResolve, myReject) => {
        try {
            let ratio = 1.0;
            sharp(buffer).metadata()
                .then((metadata) => {
                    if (metadata.format === 'png') {
                        const newWidth = metadata.width > width ? width : metadata.width;
                        ratio = newWidth / metadata.width;
                        sharp(buffer).resize(newWidth).jpeg().toBuffer()
                            .then((compressedBuffer) => {
                                myResolve({buffer: compressedBuffer, ratio});
                            })
                            .catch((err) => {
                                myReject(err.toString());
                            })
                    }
                    else {
                        if (metadata.width > width) {
                            ratio = width / metadata.width;
                            sharp(buffer).resize(width).toBuffer()
                                .then((compressedBuffer) => {
                                    myResolve({buffer: compressedBuffer, ratio});
                                })
                                .catch((err) => {
                                    myReject(err.toString());
                                })
                        }
                        else {
                            myResolve({buffer, ratio});
                        }
                    }
                })
                .catch((err) => {
                    myReject(err.toString());
                })
        }
        catch (err) {
            myReject(err.toString())
        }
    })
}

module.exports = {compress}