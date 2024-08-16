const multer = require('multer');
const path = require("path");

const multipartParser =  (options, inputField) => {
    return (req, res, next) => {
        const userId = req.body.user.id;
        const {maxFileSize, maxFilesCount, fileTypesList} = options;
        const limits = {files: maxFilesCount};

        const fileFilter = async (req, file, cb) => {
            const ext = path.extname(file.originalname).toLowerCase().replace('.', '');
            let fileTypes = ''
            for (const i in fileTypesList) {
                fileTypes += fileTypesList[i];
                fileTypes += '|';
            }
            fileTypes = fileTypes.substring(0, fileTypes.length - 1);
            const fileTypesRegex = new RegExp(fileTypes);

            if (!fileTypesRegex.test(ext)) {
                return res.status(400).json({
                    status: "failed",
                    error: req.i18n.t('faceRecognition.invalidFile'),
                    message: {
                        fileFormat: fileTypesList
                    }
                })
            }
            cb(null, true);
        }

        const parser = multer({fileFilter, limits}).array(inputField);
        parser(req, res, (err) => {
            if (err instanceof multer.MulterError) {
                switch (err.code) {
                    case 'LIMIT_FILE_COUNT':
                        return res.status(400).json({
                            status: "failed",
                            error: req.i18n.t('faceRecognition.maxFileCount'),
                            message: {
                                maxFilesCount
                            }
                        })
                    default:
                        return res.status(500).json({
                            status: "failed",
                            error: req.i18n.t('faceRecognition.parseError'),
                            message: {
                                info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
                            }
                        })
                }
            }
            else if (err) {
                return res.status(500).json({
                    status: "failed",
                    error: req.i18n.t('faceRecognition.parseError'),
                    message: {
                        info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
                    }
                })
            }
            else {
                if (req.files !== undefined) {
                    for (const file of req.files) {
                        if (file.size > maxFileSize * 1024 * 1024) {
                            return res.status(400).json({
                                status: "failed",
                                error: req.i18n.t('faceRecognition.maxFileSize'),
                                message: {
                                    maxFileSize: maxFileSize + 'MB'
                                }
                            })
                        }
                    }
                }
                req.body.user = {};
                req.body.user.id = userId;
                next();
            }
        });
    }
}

module.exports = multipartParser;