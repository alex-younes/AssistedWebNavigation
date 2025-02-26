const fs = require('fs');
const os = require('os');
const path = require('path');

// Function to get the local IP address
function getLocalIpAddress() {
    const interfaces = os.networkInterfaces();
    
    // First try Wi-Fi adapter
    const wifi = interfaces['Wi-Fi'];
    if (wifi) {
        for (const addr of wifi) {
            if (addr.family === 'IPv4' && !addr.internal) {
                return addr.address;
            }
        }
    }
    
    // Then try other interfaces but avoid VM addresses
    for (const interfaceName of Object.keys(interfaces)) {
        const iface = interfaces[interfaceName];
        for (const addr of iface) {
            if (addr.family === 'IPv4' && !addr.internal) {
                // Skip virtual machine and VMware IPs
                if (!addr.address.match(/^192\.168\.(56|17|255)\.\d+$/)) {
                    return addr.address;
                }
            }
        }
    }
    
    return 'localhost';
}

// Get the IP address
const ip = getLocalIpAddress();
console.log('Detected IP:', ip);

// Create the .env file content
const envContent = `# Development server configuration
# Bind to detected IP
HOST=${ip}
PORT=3000

# WebSocket configuration
WDS_SOCKET_HOST=${ip}
WDS_SOCKET_PORT=3000

# Security settings
DANGEROUSLY_DISABLE_HOST_CHECK=true

# API configuration
REACT_APP_API_URL=http://${ip}:3001/api
REACT_APP_SERVER_URL=http://${ip}:3001
REACT_APP_WS_URL=ws://${ip}:3001
`;

// Write to .env file
fs.writeFileSync(path.join(__dirname, '../.env'), envContent);
console.log('.env file updated with IP:', ip); 