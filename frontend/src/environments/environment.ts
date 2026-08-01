export const environment = {
  production: false,
  apiUrl: 'http://localhost:5000/api',
  keycloak: {
    issuer: 'http://localhost:8080/realms/usermgmt',
    redirectUri: 'http://localhost:4200/auth/login',
    clientId: 'usermgmt-frontend',
    responseType: 'code',
    scope: 'openid profile email',
    requireHttps: false
  }
};
