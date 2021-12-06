import "reflect-metadata";
import { container, InjectionToken } from "tsyringe";
import { Express, Request, Router, Response } from "express";

export function service<T>(path: string, token: InjectionToken<T>) {
    return function (constructor: Function) {
        let map: Map<string, any> = Reflect.getMetadata(service_router_token, constructor.prototype);
        if (!map) {
            map = new Map<string, any>();
        }
        map.set(path, container.resolve(token));
        Reflect.defineMetadata(service_router_token, map, constructor.prototype);
    }
}

export function api(path: string, method: string = "POST") {
    return function (target: any, propertyKey: string) {
        defineRequestMetadata(path, target, propertyKey, method);
    };
}

export function register(app: Express, module: any) {
    const map: Map<string, any> = Reflect.getMetadata(service_router_token, module.prototype);
    if (!map) {
        console.error("no router of service found in " + module);
        return;
    }
    for (const item of map) {
        const router = createRouter(item[1]);
        app.use(item[0], router);
    }
}

function createRouter(handler: any): Router {
    const router: Router = Router();
    const map: Map<string, ServiceHandlerInfo> = Reflect.getMetadata(service_api_map, Object.getPrototypeOf(handler));
    if (!map) {
        console.error(`none request handle found on ${typeof handler}`);
        return router;
    }

    for (const item of map.values()) {
        var func: (req: Request) => Promise<any> = Object.getPrototypeOf(handler)[item.func];
        if (func) {
            let routeFunc: any = null;
            if (item.method === "GET") {
                routeFunc = router.get;
            } else if (item.method === "POST") {
                routeFunc = router.post;
            } else {
                routeFunc = router.use;
            }
            routeFunc = routeFunc.bind(router);
            routeFunc(item.path, process(func, handler));
        }
    }
    return router;
}

type ConnectFunction = (req: Request, resp: Response, next: any) => void;


function process(func: Function, thisArg: any): (req: Request, resp: Response) => Promise<void> {
    return async (req: Request, resp: Response) => {
        var args = Object.assign({}, req.query, req.body);
        let ps = getFunctionParams(func);
        ps = ps.map(i => args[i]);
        try {
            const ret = await func.call(thisArg, ...ps);
            resp.json(ret);
        } catch (err) {
            resp.status(400).json({ err });
        }
    }
}

function getHandlerMetadata(target: any, propertyKey: string): ServiceHandlerInfo {
    var map: Map<string, ServiceHandlerInfo> = Reflect.getMetadata(service_api_map, target);
    if (!map) {
        map = new Map<string, ServiceHandlerInfo>();
        Reflect.defineMetadata(service_api_map, map, target);
    }

    if (!map.has(propertyKey)) {
        const info = { path: "", func: propertyKey, method: "any", security: true }
        map.set(propertyKey, info)
    }
    return map.get(propertyKey)!;
}

function defineRequestMetadata(path: string, target: any, propertyKey: string, method: string) {
    const info = getHandlerMetadata(target, propertyKey);
    info.path = path;
    info.func = propertyKey;
    info.method = method;
};


const STRIP_COMMENTS = /((\/\/.*$)|(\/\*[\s\S]*?\*\/))/mg;
const ARGUMENT_NAMES = /([^\s,]+)/g;
function getFunctionParams(func: Function) {
    var fnStr = func.toString().replace(STRIP_COMMENTS, '');
    var result = fnStr.slice(fnStr.indexOf('(') + 1, fnStr.indexOf(')')).match(ARGUMENT_NAMES);
    if (result === null)
        result = [];
    return result;
}

interface ServiceHandlerInfo {
    path: string;
    func: string;
    method: string;
}

const service_router_token = "SERVICE_ROUTER_TOKEN";
const service_api_map = "SERVICE_API_MAP";

