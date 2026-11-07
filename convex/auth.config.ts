// Auth config is read when functions are pushed, not inside a function, so the
// typed `env` from _generated/server is not available here.
// oxlint-disable-next-line @convex-dev/no-process-env
const clientId = process.env.WORKOS_CLIENT_ID;

const authConfig = {
	providers: [
		{
			type: "customJwt",
			issuer: `https://api.workos.com/`,
			algorithm: "RS256",
			jwks: `https://api.workos.com/sso/jwks/${clientId}`,
			applicationID: clientId,
		},
		{
			type: "customJwt",
			issuer: `https://api.workos.com/user_management/${clientId}`,
			algorithm: "RS256",
			jwks: `https://api.workos.com/sso/jwks/${clientId}`,
		},
	],
};

export default authConfig;
