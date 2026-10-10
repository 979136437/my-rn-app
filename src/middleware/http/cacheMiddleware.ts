import { delay } from "@/utils"; // 假设这是你的工具函数
import type { Method } from "alova";
import type { AlovaFrontMiddleware } from "alova/client";
import { createMMKV } from "react-native-mmkv";

// 定义默认常量
const STORAGE_THRESHOLD = 1024 * 1024 * 1; // 1MB
const STORAGE_KEYS_KEY = "alova_cache_keys_v1"; // 加上版本号避免冲突
const UNKNOWN_STORAGE_LIMIT = 0;
const MIN_REQUEST_DELAY_MS = 0;
const EMPTY_CACHE_VALUE = "";
const FUNCTION_TYPE = "function";
const CACHE_ACTION = { add: "add", remove: "remove" } as const;

// 定义更严谨的类型
interface StorageAdapter {
  get: (key: string) => any;
  set: (key: string, value: any) => void;
  remove: (key: string) => void;
  info: () => { currentSize: number; limitSize: number }; // 单位为字节，limitSize 为 0 表示未知
}

interface CacheMiddlewareOptions {
  prefix?: string | ((method: Method) => string | Promise<string>);
  delay?: number; // 模拟网络延迟
  limit?: number; // 预留空间（字节）；存储上限未知时作为清理阈值
  errorClear?: boolean; // 请求失败是否清除缓存
  store?: StorageAdapter;
}

function isPrefixFactory(
  value: CacheMiddlewareOptions["prefix"],
): value is (method: Method) => string | Promise<string> {
  return typeof value === FUNCTION_TYPE;
}

const store = createMMKV({
  id: "alova_cache",
});

export function cacheMiddleware(options: CacheMiddlewareOptions = {}): any {
  // 1. 适配器模式：兼容 UniApp 和自定义存储
  // 使用 ?. 并在默认值中直接调用 uni 方法，确保上下文安全
  const adapter: StorageAdapter = options.store ?? {
    get: (key) => {
      const value = store.getString(key);
      if (value === undefined) return undefined;
      try {
        return JSON.parse(value);
      } catch {
        return undefined;
      }
    },
    set: (key, val) => store.set(key, JSON.stringify(val)),
    remove: (key) => store.remove(key),
    info: () => ({
      currentSize: store.byteSize,
      // MMKV exposes its occupied size, but no storage capacity limit.
      limitSize: UNKNOWN_STORAGE_LIMIT,
    }),
  };

  const {
    limit = STORAGE_THRESHOLD,
    errorClear = true,
    delay: delayTime = 0,
  } = options;

  // 辅助函数：管理 Keys (LRU 核心)
  const updateKeys = (
    currentKey: string,
    action: (typeof CACHE_ACTION)[keyof typeof CACHE_ACTION],
  ) => {
    try {
      let keys: string[] = adapter.get(STORAGE_KEYS_KEY) || [];

      if (action === CACHE_ACTION.remove) {
        keys = keys.filter((k) => k !== currentKey);
      } else {
        // LRU: 先移除旧的（如果存在），再添加到末尾
        keys = keys.filter((k) => k !== currentKey);
        keys.push(currentKey);
      }

      adapter.set(STORAGE_KEYS_KEY, keys);
      return keys;
    } catch (e) {
      console.error("Cache Key Update Failed:", e);
      return [];
    }
  };

  // 辅助函数：清理空间 (智能清理)
  const ensureSpace = () => {
    try {
      const { currentSize, limitSize } = adapter.info();
      // 如果没有 limitSize (Web 端可能没有)，则只依赖 limit
      const maxAvailable =
        limitSize > UNKNOWN_STORAGE_LIMIT
          ? Math.max(0, limitSize - limit)
          : limit;
      // 如果当前占用空间已经逼近限制 (保留 limit 大小的缓冲)
      if (currentSize > maxAvailable) {
        const keys: string[] = adapter.get(STORAGE_KEYS_KEY) || [];
        // 移除最早的一半数据
        const removeCount = Math.max(1, Math.floor(keys.length / 2));
        const keysToRemove = keys.slice(0, removeCount);
        const keysToKeep = keys.slice(removeCount);

        keysToRemove.forEach((k) => adapter.remove(k));
        adapter.set(STORAGE_KEYS_KEY, keysToKeep);
        console.warn(
          `[Cache] Pruned ${removeCount} old cache items due to size limit.`,
        );
      }
    } catch {
      // 忽略 info 获取失败的情况
    }
  };

  let latestRequest: symbol | undefined;
  const middleware: AlovaFrontMiddleware<any> = async (ctx, next) => {
    const request = Symbol();
    latestRequest = request;
    const { method, proxyStates } = ctx;

    // 2. 计算 Key (支持异步前缀)
    let prefix = "";
    if (isPrefixFactory(options.prefix)) {
      prefix = await options.prefix(method);
    } else if (options.prefix) {
      prefix = options.prefix;
    }
    const key = prefix ? `${prefix}:${method.key}` : method.key;

    // 3. 读取缓存 (Hit Cache)
    const cache = adapter.get(key);

    if (
      request === latestRequest &&
      cache !== undefined &&
      cache !== null &&
      cache !== EMPTY_CACHE_VALUE
    ) {
      // 命中缓存：立即更新 UI
      proxyStates.data.v = cache;
      // LRU 优化：读取也算"活跃"，更新 Key 位置
      updateKeys(key, CACHE_ACTION.add);
    }

    try {
      // 4. 发起真实请求
      if (delayTime > MIN_REQUEST_DELAY_MS) await delay(delayTime);
      const res = await next();

      // 5. 写入缓存 (Write Cache)
      // 先尝试清理空间
      ensureSpace();

      try {
        adapter.set(key, res);
        updateKeys(key, CACHE_ACTION.add);
      } catch (e) {
        // Keep the existing index so cached entries remain discoverable.
        console.error("Cache Write Failed:", e);
      }

      return res;
    } catch (err) {
      // 6. 错误回退
      if (errorClear && request === latestRequest) {
        adapter.remove(key);
        updateKeys(key, CACHE_ACTION.remove);
        // 恢复初始数据，避免 UI 显示脏数据
        const { initialData } = ctx.config;
        proxyStates.data.v =
          typeof initialData === FUNCTION_TYPE ? initialData() : initialData;
      }
      throw err;
    }
  };
  return middleware;
}
