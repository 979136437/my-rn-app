import type { AlovaFrontMiddleware } from "alova/client";

export function multipleMiddleware(
  middlewares: AlovaFrontMiddleware<any>[],
): any {
  const middleware: AlovaFrontMiddleware<any> = async (ctx, next) => {
    let index = -1;

    async function dispatch(
      i: number,
      config?: Parameters<typeof next>[0],
    ): Promise<any> {
      if (i <= index) throw new Error("next() called multiple times");
      index = i;

      if (i === middlewares.length) return next(config); // 到底层请求
      const fn = middlewares[i]!;
      return fn(ctx, (nextConfig) =>
        dispatch(i + 1, { ...config, ...nextConfig }),
      );
    }

    return dispatch(0); // 返回整个链条的结果
  };
  return middleware;
}
