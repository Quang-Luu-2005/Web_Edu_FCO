require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const createApp = require('./createApp');

const app = createApp();

const PORT = process.env.PORT || 8000;
const HOST = process.env.HOST || '0.0.0.0';

const server = app.listen(PORT, HOST, () => console.log(`Server running on ${HOST}:${PORT}`));

module.exports = { app, server };
