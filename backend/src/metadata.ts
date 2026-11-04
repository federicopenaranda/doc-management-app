/* eslint-disable */
export default async () => {
    const t = {};
    return { "@nestjs/swagger": { "models": [], "controllers": [[import("./app.controller.js"), { "AppController": { "getHello": { type: String } } }], [import("./health/health.controller.js"), { "HealthController": { "check": { type: Object } } }]] } };
};