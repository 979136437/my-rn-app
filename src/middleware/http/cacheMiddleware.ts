import { delay } from "@/utils"; // 假设这是你的工具函数
import type { Method } from "alova";
import type { AlovaFrontMiddleware } from "alova/client";
import { createMMKV } from "react-native-mmkv";

// 定义默认常量
const STORAGE_THRESHOLD = 1024 * 1024 * 1; // 1MB
const STORAGE_KEYS_KEY = "alova_cache_keys_v1"; // 加上版本号避免冲突

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
      limitSize: STORAGE_THRESHOLD * 100,
    }),
  };

  const {
    limit = STORAGE_THRESHOLD,
    errorClear = true,
    delay: delayTime = 0,
  } = options;

  // 辅助函数：管理 Keys (LRU 核心)
  const updateKeys = (currentKey: string, action: "add" | "remove") => {
    try {
      let keys: string[] = adapter.get(STORAGE_KEYS_KEY) || [];

      if (action === "remove") {
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
        limitSize > 0 ? Math.max(0, limitSize - limit) : limit;
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

  const middleware: AlovaFrontMiddleware<any> = async (ctx, next) => {
    const { method, proxyStates } = ctx;

    // 2. 计算 Key (支持异步前缀)
    let prefix = "";
    if (typeof options.prefix === "function") {
      prefix = await options.prefix(method);
    } else if (options.prefix) {
      prefix = options.prefix;
    }
    const key = prefix ? `${prefix}:${method.key}` : method.key;

    // 3. 读取缓存 (Hit Cache)
    const cache = adapter.get(key);

    if (cache !== undefined && cache !== null && cache !== "") {
      // 命中缓存：立即更新 UI
      proxyStates.data.v = cache;
      // LRU 优化：读取也算"活跃"，更新 Key 位置
      updateKeys(key, "add");
    }

    try {
      // 4. 发起真实请求
      if (delayTime > 0) await delay(delayTime);
      const res = await next();

      // 5. 写入缓存 (Write Cache)
      // 先尝试清理空间
      ensureSpace();

      try {
        adapter.set(key, res);
        updateKeys(key, "add");
      } catch (e) {
        // 处理 Quota Exceeded 错误 (尤其是 LocalStorage 5MB 限制)
        console.error("Storage Quota Exceeded, clearing old cache...", e);
        adapter.set(STORAGE_KEYS_KEY, []); // 极端情况：清空索引
        // 这里可以选择不做任何事，或者清空所有缓存重试，避免崩坏
      }

      return res;
    } catch (err) {
      // 6. 错误回退
      if (errorClear) {
        adapter.remove(key);
        updateKeys(key, "remove");
        // 恢复初始数据，避免 UI 显示脏数据
        const { initialData } = ctx.config;
        proxyStates.data.v =
          typeof initialData === "function" ? initialData() : initialData;
      }
      throw err;
    }
  };
  return middleware;
}
