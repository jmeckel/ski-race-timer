declare module 'jsonwebtoken' {
  export interface SignOptions {
    algorithm?: string;
    expiresIn?: string | number;
    issuer?: string;
    [key: string]: unknown;
  }

  export interface VerifyOptions {
    algorithms?: string[];
    issuer?: string;
    [key: string]: unknown;
  }

  interface Jwt {
    sign(payload: string | Buffer | object, secretOrPrivateKey: string, options?: SignOptions): string;
    verify(token: string, secretOrPublicKey: string, options?: VerifyOptions): object;
  }

  const jwt: Jwt;
  export default jwt;
}
