import HttpResponse from './http.response';
import HttpError from './http.error';

type Interceptor = (config: RequestInit) => RequestInit;
type ResponseInterceptor = (response: Response) => Response;

class HttpClient {
    private authToken: string | null = null;
    private serviceSecret: string | null = null;
    private requestInterceptors: Interceptor[] = [];
    private responseInterceptors: ResponseInterceptor[] = [];
    private loggingEnabled: boolean = false;
    private responseLoggingEnabled: boolean = false;

    constructor(protected baseURL: string, protected timeout: number = 5000, protected retries: number = 3) {
    }

    setAuthToken(token: string) {
        this.authToken = token;
    }

    setServiceSecret(secret: string) {
        this.serviceSecret = secret;
    }

    enableLogging() {
        this.loggingEnabled = true;
    }

    enableResponseLogging() {
        this.responseLoggingEnabled = true;
    }

    addRequestInterceptor(interceptor: Interceptor) {
        this.requestInterceptors.push(interceptor);
    }

    addResponseInterceptor(interceptor: ResponseInterceptor) {
        this.responseInterceptors.push(interceptor);
    }

    private applyRequestInterceptors(config: RequestInit): RequestInit {
        return this.requestInterceptors.reduce((acc, interceptor) => interceptor(acc), config);
    }

    private applyResponseInterceptors(response: Response): Response {
        if (this.responseLoggingEnabled) {
            console.log(`Response: ${response.status} ${response.url}`, response);
        }
        return this.responseInterceptors.reduce((acc, interceptor) => interceptor(acc), response);
    }

    private logRequest(method: string, url: string, options: RequestInit) {
        if (this.loggingEnabled) {
            console.log(`Request: ${method} ${url}`, options);
        }
    }

    private async handleResponse(response: Response): Promise<HttpResponse<any>> {
        const data = await response.json();
        return new HttpResponse(data, response.status, response.headers);
    }

    private handleError(response: Response): never {
        throw new HttpError(response.status, response.statusText, response.url);
    }

    async request(method: string, endpoint: string, data: any = null, config: any = {}) {
        const url = `${this.baseURL}${endpoint}`;
        const headers = {
            'Content-Type': 'application/json',
            ...config.headers,
        };

        if (this.authToken) {
            headers['Authorization'] = `Bearer ${this.authToken}`;
        }

        let options: RequestInit = {
            method,
            headers,
            body: data ? JSON.stringify(data) : null,
            credentials: config.credentials || 'same-origin',
        };

        options = this.applyRequestInterceptors(options);
        this.logRequest(method, url, options);

        for (let attempt = 0; attempt < this.retries; attempt++) {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), this.timeout);
            options.signal = controller.signal;

            try {
                let response = await fetch(url, options);
                clearTimeout(timeoutId);
                response = this.applyResponseInterceptors(response);
                if (!response.ok) {
                    this.handleError(response);
                }
                return await this.handleResponse(response);
            } catch (error) {
                clearTimeout(timeoutId);
                if (attempt < this.retries - 1) {
                    console.warn(`Retrying request to ${url} (attempt ${attempt + 1})`);
                } else {
                    console.error(`${method} request to ${url} failed:`, error);
                    throw error;
                }
            }
        }
    }

    async upload(endpoint: string, file: File, config: any = {}) {
        const url = `${this.baseURL}${endpoint}`;
        const formData = new FormData();
        formData.append('file', file);

        const headers = {
            ...config.headers,
        };

        if (this.authToken) {
            headers['Authorization'] = `Bearer ${this.authToken}`;
        }

        let options: RequestInit = {
            method: 'POST',
            headers,
            body: formData,
            credentials: config.credentials || 'same-origin',
        };

        options = this.applyRequestInterceptors(options);
        this.logRequest('POST', url, options);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);
        options.signal = controller.signal;

        try {
            let response = await fetch(url, options);
            clearTimeout(timeoutId);
            response = this.applyResponseInterceptors(response);
            if (!response.ok) {
                this.handleError(response);
            }
            return await this.handleResponse(response);
        } catch (error) {
            clearTimeout(timeoutId);
            console.error(`File upload to ${url} failed:`, error);
            throw error;
        }
    }

    async download(endpoint: string, config: any = {}) {
        const url = `${this.baseURL}${endpoint}`;
        const headers = {
            ...config.headers,
        };

        if (this.authToken) {
            headers['Authorization'] = `Bearer ${this.authToken}`;
        }

        let options: RequestInit = {
            method: 'GET',
            headers,
            credentials: config.credentials || 'same-origin',
        };

        options = this.applyRequestInterceptors(options);
        this.logRequest('GET', url, options);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);
        options.signal = controller.signal;

        try {
            let response = await fetch(url, options);
            clearTimeout(timeoutId);
            response = this.applyResponseInterceptors(response);
            if (!response.ok) {
                this.handleError(response);
            }
            return await response.blob();
        } catch (error) {
            clearTimeout(timeoutId);
            console.error(`File download from ${url} failed:`, error);
            throw error;
        }
    }

    get(endpoint: string, config: any = {}) {
        return this.request('GET', endpoint, null, config);
    }

    post(endpoint: string, data: any, config: any = {}) {
        return this.request('POST', endpoint, data, config);
    }

    put(endpoint: string, data: any, config: any = {}) {
        return this.request('PUT', endpoint, data, config);
    }

    delete(endpoint: string, config: any = {}) {
        return this.request('DELETE', endpoint, null, config);
    }
}

export default HttpClient;