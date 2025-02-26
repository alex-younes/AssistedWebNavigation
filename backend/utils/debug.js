const { DEBUG } = require('../config/constants');

const debug = (message, data = '') => {
    if (DEBUG) {
        console.log(`[DEBUG] ${message}`, data);
    }
};

module.exports = debug;