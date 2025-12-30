declare namespace Deno {
    export interface Env {
        get(key: string): string | undefined;
    }
    export const env: Env;
    export function serve(handler: (request: Request) => Promise<Response> | Response): void;
    export function serve(
        options: {
            port?: number;
            hostname?: string;
            onListen?: (params: { hostname: string; port: number }) => void;
        },
        handler: (request: Request) => Promise<Response> | Response
    ): void;
}
