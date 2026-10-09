import { axiosRequestAdapter } from "@alova/adapter-axios";
import { createAlova } from "alova";
import reactHook from "alova/react";

const alova = createAlova({
  baseURL: `https://admapi.happyvalley.link`,
  requestAdapter: axiosRequestAdapter(),
  statesHook: reactHook,
  cacheFor: null,
  cacheLogger: false,
  timeout: 60 * 2 * 1000, // 2分钟,
  beforeRequest(method) {
    method.config.headers = {
      ...method.config.headers,
      "Content-Type": "application/json",
    };
  },
  responded: {
    async onSuccess(res, method) {
      if (method?.meta?.NoHandle) {
        return res;
      }
      if (res.status !== 200) {
        throw new Error(res.statusText ?? "服务错误，请稍后重试.");
      }
      const result = res.data;
      const code = result.code ?? result.status;

      if (code === 0) {
        throw new Error(result.msg ?? "服务错误，请稍后重试..");
      }
      return result.data;
    },
    async onError(res, method) {},
  },
});

export default alova;
