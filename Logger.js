const {createLogger, format, transports, configure} = require('winston');

const logger = createLogger({
    exitOnError: false, //Prevent crash
    defaultMeta: { service: 'SciCraftWhitelistManager' },
    rejectionHandlers: [
        new transports.File({
            format: format.simple(),
            json: true,
            handleExceptions: true,
            filename: 'logs/rejections.log'
        })
    ]
});

logger.add(new transports.File({
    format: format.combine(
        format.timestamp({
            format: 'DD-MM-YYYY HH:mm:ss'
        }),
        format.simple()
    ),
    filename: 'logs/combined.log',
    level: 'debug'
}));

logger.add(new transports.File({
    format: format.combine(
        format.timestamp({
            format: 'DD-MM-YYYY HH:mm:ss'
        }),
        format.errors({ stack: true }),
        format.simple()
    ),
    handleExceptions: true,
    filename: 'logs/errors.log',
    level: 'error'
}));

logger.on('finish', function () {
    console.info('Logger has finished logging!');
});

module.exports = logger;