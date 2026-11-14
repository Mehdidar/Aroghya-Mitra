/**
 * ABDM gateway session types.
 *
 * Source: NHA's own open-source ABDM wrapper (github.com/NHA-ABDM/ABDM-wrapper,
 * checked 2026-11-14):
 *   - mock-gateway/src/main/resources/abdm-gateway.yaml  (SessionRequest, SessionResponse)
 *   - src/main/java/in/nha/abdm/wrapper/v1/common/requests/SessionManager.java (headers, grantType)
 *   - src/main/resources/application-v3.properties (createSessionPath=/gateway/v3/sessions,
 *     sandbox https://dev.abdm.gov.in/api/hiecm, production https://apis.abdm.gov.in/api/hiecm)
 *
 * Only the session call is modelled. ABHA verification (V3) is not built: see
 * server/integrations/README.md and docs/INTEGRATIONS.md for why.
 */

export interface AbdmSessionRequest {
  clientId: string;
  clientSecret: string;
  grantType: 'client_credentials' | 'refresh_token';
  refreshToken?: string;
}

export interface AbdmSessionResponse {
  accessToken: string;
  /**
   * Token lifetime. The published spec labels it "In Minutes" with an example
   * of 1800, while NHA's wrapper treats tokens as expiring after 20 minutes.
   * We read it as seconds and never reuse a token for more than 15 minutes.
   */
  expiresIn?: number;
  refreshExpiresIn?: number;
  refreshToken?: string;
  tokenType?: string;
}
