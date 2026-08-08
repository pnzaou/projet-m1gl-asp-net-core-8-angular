// En production le frontend est servi par la gateway nginx, qui expose l'API
// sur /api/ et Keycloak sur /auth/ (voir gateway/nginx.conf). Les URLs sont
// donc relatives à l'origine : pas de host codé en dur, pas de CORS.
export const environment = {
  production: true,
  apiUrl: '/api',
  keycloakUrl: '/auth'
};
