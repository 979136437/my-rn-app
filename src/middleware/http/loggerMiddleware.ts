import { ISDEV } from "@/constants";
import type { AlovaFrontMiddleware } from "alova/client";

export function loggerMiddleware(): any {
  const middleware: AlovaFrontMiddleware<any> = async (ctx, next) => {
    ISDEV && console.log("[logger] before request:", ctx.method.key);
    const result = await next();
    ISDEV &&
      console.log("[logger] after request:", ctx.method.key, "result:", result);
    return result;
  };
  return middleware;
}
