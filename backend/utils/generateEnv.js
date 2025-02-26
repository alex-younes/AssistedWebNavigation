const fs = require('fs');
const os = require('os');
const path = require('path');

const getLocalIpAddress = () => {
    const interfaces = os.networkInterfaces();
    for (const interfaceName of Object.keys(interfaces)) {
        const addresses = interfaces[interfaceName];
        for (const addr of addresses) {
            if (addr.family === 'IPv4' && !addr.internal) {
                return addr.address;
            }
        }
    }
    return 'localhost';
};

const generateEnvFiles = () => {
    const localIp = getLocalIpAddress();
    const port = process.env.PORT || 3001;
    
    // Frontend .env
    const frontendEnv = `REACT_APP_API_URL=http://${localIp}:${port}/api
REACT_APP_SERVER_URL=http://${localIp}:${port}
REACT_APP_WS_URL=ws://${localIp}:${port}
PORT=3000`;

    fs.writeFileSync(path.join(__dirname, '../../frontend/.env'), frontendEnv);
    console.log('Frontend .env file generated');

    // Extension .env
    const extensionEnv = `API_URL=http://${localIp}:${port}/api
SERVER_URL=http://${localIp}:${port}
WS_URL=ws://${localIp}:${port}`;

    fs.writeFileSync(path.join(__dirname, '../../extension/.env'), extensionEnv);
    console.log('Extension .env file generated');
};

generateEnvFiles(); 